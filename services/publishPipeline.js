// services/publishPipeline.js — ท่อโพสต์ของกลาง (ตะกร้าสื่อใน Discord + worker ของ posts ใช้ร่วมกัน)
//
// กติกาข้อ 16 (md/posts/POSTS.md): **ห้ามมี logic การโพสต์อยู่ที่อื่น**
//   - ลำดับ "เตรียมสื่อ → เลือกบัญชี → ยิงทีละแพลตฟอร์ม → เก็บผล" อยู่ที่ไฟล์นี้ที่เดียว
//   - `handlers/basketHandler.js` เหลือแค่โค้ด UI ของ Discord (อ่านตะกร้า + format ข้อความตอบ)
//   - ห้ามเรียก Graph API / X API ตรงจากที่อื่น — ต้องผ่าน services/metaApi.js · services/xApi.js
//
// ไฟล์นี้ **ไม่รู้จัก discord.js interaction** — รายงานความคืบหน้าผ่าน callback `onProgress(msg)`
// (ตะกร้าส่ง editReply เข้ามา · worker ส่ง noop) เพื่อให้ฝั่งเว็บเรียกได้โดยไม่ต้องมี Discord
const sharp = require('sharp');
const { fetchBuffer, applyWatermark } = require('../utils/watermarkImage');
const { postToFacebook, postToInstagram, postToThreads, postReelsToFacebook, postReelsToInstagram, postReelsToThreads } = require('./metaApi');
const { postToX, postVideoToX } = require('./xApi');
const { postNews } = require('./newsShare');

const noop = () => {};

/**
 * เตรียมรูปให้พร้อมยิง — โหลด buffer → ติดลายน้ำ (ถ้ามี) → webp เป็น jpg
 *
 * @param {Array<{url?:string, buffer?:Buffer, ext?:string}>} sources
 *        `url` = โหลดจากเน็ต (Discord CDN) · `buffer` = มีอยู่แล้ว (เว็บอ่านจากดิสก์มาให้)
 * @param {{watermarkPath?:string|null, onProgress?:function}} opts
 *        watermarkPath = path ที่ resolve มาแล้ว — **pipeline ไม่รู้เรื่องโครงโฟลเดอร์ลายน้ำ**
 *        (ผู้เรียกเป็นคนรู้ว่าลายน้ำของ guild/กลุ่ม/ส่วนตัวอยู่ไหน)
 * @returns {{processed: Array<{buffer:Buffer, ext:string}>, errors: string[]}}
 */
async function prepareImages(sources, { watermarkPath = null, onProgress = noop } = {}) {
  const processed = [];
  const errors = [];
  const total = sources.length;

  for (let i = 0; i < total; i++) {
    try {
      let buffer = sources[i].buffer || await fetchBuffer(sources[i].url);
      let ext = sources[i].ext || null;

      if (watermarkPath) {
        const out = await applyWatermark(buffer, {
          imagePath: watermarkPath, position: 'random', opacity: 0.8, size: 0.13,
        });
        buffer = out.buffer;
        ext = out.ext;
      } else {
        if (!ext) {
          const m = (sources[i].url || '').match(/\.(png|jpe?g|webp)/i);
          ext = m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
        }
        // IG/Threads ไม่รับ webp → แปลงตั้งแต่ต้นทาง (ทำมาก่อนหน้านี้ในตะกร้าอยู่แล้ว)
        if (ext === 'webp') {
          buffer = await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
          ext = 'jpg';
        }
      }
      processed.push({ buffer, ext });
    } catch (err) {
      errors.push(`รูป ${i + 1}: ${err.message}`);
    }
    onProgress(watermarkPath ? `⏳ ติดลายน้ำ ${i + 1}/${total} รูป...` : `⏳ กำลังดาวน์โหลดรูป ${i + 1}/${total}...`);
  }

  return { processed, errors };
}

// ป้ายชื่อที่ใช้ในข้อความตอบ — เก็บไว้ที่เดียวกับตัวยิง จะได้ไม่เพี้ยนกันระหว่างช่องทาง
const PLATFORM_LABEL = { fb: 'Facebook', ig: 'Instagram', threads: '@ Threads', x: 'X (Twitter)', news: 'ห้องข่าวสาร' };

/**
 * ยิง 1 แพลตฟอร์ม — **ที่เดียวที่รู้ว่าแต่ละแพลตฟอร์มต้องเรียกฟังก์ชันไหน**
 *
 * @param {object} o
 * @param {'fb'|'ig'|'threads'|'x'|'news'} o.platform
 * @param {Array<{buffer:Buffer, ext:string}>} [o.images]  โพสต์รูป (ผ่าน prepareImages มาแล้ว)
 * @param {string} [o.videoUrl]   โพสต์วิดีโอ — ต้องเป็น **URL สาธารณะ** (Meta เป็นคนไปดึงเอง)
 * @param {number|null} [o.scheduleTime] unix วินาที (FB เท่านั้น — เจ้าอื่นไม่รองรับ)
 * @param {number|null} [o.accountId] เลือกบัญชีเจาะจง (posts บนเว็บ) · null = เลือกอัตโนมัติเหมือนเดิม
 * @param {object} [o.guild] discord.js Guild — จำเป็นเฉพาะ platform 'news'
 * @returns {{platform:string, label:string, ok:boolean, url:string|null, error:string|null}}
 */
async function publishOne({
  platform, guildId, userDiscordId, accountId = null,
  images = [], videoUrl = null, caption = '', scheduleTime = null,
  group = null, guild = null, onProgress = noop,
}) {
  const label = PLATFORM_LABEL[platform] || platform;
  const isVideo = !!videoUrl;
  onProgress(`📤 กำลังโพสต์ไปยัง ${label}${isVideo ? ' (วิดีโอ)' : ''}...`);

  try {
    let url = null;

    if (platform === 'fb') {
      if (isVideo) {
        const res = await postReelsToFacebook(guildId, userDiscordId, videoUrl, caption, onProgress, group, scheduleTime, accountId);
        url = res?.permalink || null;
      } else {
        const res = await postToFacebook(guildId, userDiscordId, images, caption, scheduleTime, group, accountId);
        // FB คืน id รูปแบบ "<pageId>_<postId>" → ประกอบเป็นลิงก์เอง (API ไม่คืน permalink มาให้)
        const parts = (res?.id || '').split('_');
        if (parts.length === 2) url = `https://www.facebook.com/permalink.php?story_fbid=${parts[1]}&id=${parts[0]}`;
      }
    } else if (platform === 'ig') {
      const res = isVideo
        ? await postReelsToInstagram(guildId, userDiscordId, videoUrl, caption, onProgress, group, accountId)
        : await postToInstagram(guildId, userDiscordId, images, caption, null, onProgress, group, accountId);
      url = res?.permalink || null;
    } else if (platform === 'threads') {
      const res = isVideo
        ? await postReelsToThreads(guildId, userDiscordId, videoUrl, caption, onProgress, group, accountId)
        : await postToThreads(guildId, userDiscordId, images, caption, onProgress, group, accountId);
      url = res?.permalink || null;
    } else if (platform === 'x') {
      const res = isVideo
        ? await postVideoToX(guildId, userDiscordId, videoUrl, caption, group, accountId)
        : await postToX(guildId, userDiscordId, images, caption, group, accountId);
      url = res?.url || null;
    } else if (platform === 'news') {
      if (!guild) throw new Error('ห้องข่าวสารต้องมี Discord guild');
      if (isVideo) {
        const msg = await postNews(guild, { content: [caption, videoUrl].filter(Boolean).join('\n') });
        url = msg?.url || null;
      } else {
        // Discord จำกัด 10 ไฟล์/ข้อความ → เกินให้ต่อข้อความถัดไป · ลิงก์ที่คืนคือข้อความแรก
        const files = images.map((p, i) => ({ attachment: p.buffer, name: `image_${i + 1}.${p.ext}` }));
        let firstMsg = null;
        for (let i = 0; i < files.length; i += 10) {
          const msg = await postNews(guild, {
            content: i === 0 ? (caption || undefined) : undefined,
            files: files.slice(i, i + 10),
          });
          if (!firstMsg) firstMsg = msg;
        }
        url = firstMsg?.url || null;
      }
    } else {
      throw new Error(`ไม่รู้จักแพลตฟอร์ม ${platform}`);
    }

    return { platform, label, ok: true, url, error: null };
  } catch (err) {
    return { platform, label, ok: false, url: null, error: err.message };
  }
}

/**
 * ยิงหลายแพลตฟอร์มทีละตัว — ตัวหนึ่งล้มไม่ทำให้ตัวอื่นล้ม (คืน result ครบทุกตัว)
 * ⚠️ ยิงเรียงตัว ไม่ขนาน — โควตา API ของ Meta/X เป็นราย token ยิงพร้อมกันเสี่ยงโดน throttle
 *    และ onProgress ที่พิมพ์ทับกันจะอ่านไม่รู้เรื่อง
 * @returns {{results: Array, status: 'success'|'partial'|'failed'}}
 */
async function publishBatch({ platforms = [], ...ctx }) {
  const results = [];
  for (const platform of platforms) {
    results.push(await publishOne({ platform, ...ctx }));
  }
  const okCount = results.filter(r => r.ok).length;
  const status = okCount === results.length ? 'success' : okCount === 0 ? 'failed' : 'partial';
  return { results, status };
}

module.exports = { prepareImages, publishOne, publishBatch, PLATFORM_LABEL };
