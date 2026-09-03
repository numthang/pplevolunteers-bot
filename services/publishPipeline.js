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
const { pickWatermarkPos } = require('../utils/quoteStyleKeys');
const { postToFacebook, postToInstagram, postToThreads, postReelsToFacebook, postReelsToInstagram, postReelsToThreads } = require('./metaApi');
const { postToX, postVideoToX } = require('./xApi');
const { postNews, fetchNewsChannel } = require('./newsShare');
const { saveMediaToTemp } = require('./metaApi');
const storage = require('../utils/postsStorage');
const pool = require('../db/index');
const { randomUUID } = require('crypto');

const noop = () => {};

/**
 * สื่อในรูปแบบที่เก็บไว้ (path บนดิสก์ / URL ของ Discord) → input ที่ publishOne กินได้
 * **ที่เดียวที่รู้ว่าไฟล์บนดิสก์กลายเป็นอะไรตอนส่งให้แต่ละแพลตฟอร์ม** — ตะกร้าดิสฯ กับ worker ใช้ร่วมกัน
 *
 * @param {Array<{kind:'image'|'video', path?:string, url?:string}>} items
 * @param {{refreshUrls?:function}} opts  refreshUrls = async (urls[]) => Map — ลิงก์ Discord หมดอายุ ~24 ชม.
 * @returns {{images: Array<{buffer?:Buffer, ext?:string, url?:string}>, videoUrl: string|null, videoPath: string|null}}
 */
async function loadMediaSources(items = [], { refreshUrls = null } = {}) {
  const images = [];
  let videoUrl = null;
  // ไฟล์ต้นฉบับบนดิสก์ — มีไว้ให้ห้องข่าว Discord แนบไฟล์ตรง (ลิงก์ media-temp ตายใน 24 ชม.)
  let videoPath = null;

  // รีเฟรชเฉพาะแถวที่ยังไม่มีไฟล์บนดิสก์ (ไฟล์บนดิสก์ไม่มีวันหมดอายุ)
  const stale = items.filter(m => !m.path && m.url).map(m => m.url);
  if (stale.length && refreshUrls) {
    try {
      const fresh = await refreshUrls(stale);
      if (fresh?.size) for (const m of items) if (m.url && fresh.has(m.url)) m.url = fresh.get(m.url);
    } catch (err) {
      console.error('[publishPipeline] รีเฟรชลิงก์ไม่สำเร็จ:', err.message);
    }
  }

  for (const m of items) {
    if (m.kind === 'video') {
      // IG/Threads/Reels ไม่รับไฟล์อัปโหลดตรง — ต้องให้ URL แล้วเขามาดึงเอง
      // ไฟล์ของเราอยู่นอกเน็ต → วางลง media-temp (โฟลเดอร์เดียวกับที่รูป IG ใช้อยู่แล้ว) แล้วส่ง URL นั้น
      if (m.path) {
        videoPath = m.path;
        try {
          const tmp = saveMediaToTemp(await storage.readFile(m.path), storage.extOfPath(m.path));
          if (/^https?:\/\//.test(tmp)) { videoUrl = tmp; continue; }
          // URL สัมพัทธ์ = Meta เข้าไม่ถึง → ตกไปใช้ลิงก์ Discord เดิมถ้ายังมี
          if (!m.url) throw new Error('WEB_BASE_URL (หรือ META_TEMP_URL) ไม่ได้ตั้ง — ส่งวิดีโอให้ Meta ไม่ได้');
          console.warn('[publishPipeline] media-temp ให้ URL สัมพัทธ์ — ใช้ลิงก์ Discord แทน');
        } catch (err) {
          if (!m.url) throw err;
          console.error('[publishPipeline] อ่านวิดีโอจากดิสก์ไม่ได้ ใช้ลิงก์ Discord แทน:', err.message);
        }
      }
      if (m.url) videoUrl = m.url;
      continue;
    }

    if (m.path) {
      try {
        images.push({ buffer: await storage.readFile(m.path), ext: storage.extOfPath(m.path), quoteStyle: m.quote_style || null });
        continue;
      } catch (err) {
        if (!m.url) throw err;   // ไม่มีทางกลับแล้วจริงๆ
        console.error('[publishPipeline] อ่านรูปจากดิสก์ไม่ได้ ใช้ลิงก์ต้นทางแทน:', err.message);
      }
    }
    if (m.url) images.push({ url: m.url, quoteStyle: m.quote_style || null });
  }

  return { images, videoUrl, videoPath };
}

/**
 * เตรียมรูปให้พร้อมยิง — โหลด buffer → ติดลายน้ำ (ถ้ามี) → webp เป็น jpg
 *
 * @param {Array<{url?:string, buffer?:Buffer, ext?:string, quoteStyle?:string|null}>} sources
 *        `url` = โหลดจากเน็ต (Discord CDN) · `buffer` = มีอยู่แล้ว (เว็บอ่านจากดิสก์มาให้)
 *        `quoteStyle` = คีย์สไตล์ถ้ารูปนั้นเป็นการ์ดคำคม — ใช้กันลายน้ำทับตัวหนังสือ
 * @param {{watermarkPath?:string|null, wmPos?:string|null, onProgress?:function}} opts
 *        watermarkPath = path ที่ resolve มาแล้ว — **pipeline ไม่รู้เรื่องโครงโฟลเดอร์ลายน้ำ**
 *        (ผู้เรียกเป็นคนรู้ว่าลายน้ำของ guild/กลุ่ม/ส่วนตัวอยู่ไหน)
 *        wmPos = ตำแหน่งที่ผู้ใช้เลือก · ว่าง/'random' = สุ่มเลี่ยงข้อความของการ์ด (ดู pickWatermarkPos)
 * @returns {{processed: Array<{buffer:Buffer, ext:string}>, errors: string[]}}
 */
async function prepareImages(sources, { watermarkPath = null, wmPos = null, onProgress = noop } = {}) {
  const processed = [];
  const errors = [];
  const total = sources.length;

  for (let i = 0; i < total; i++) {
    try {
      let buffer = sources[i].buffer || await fetchBuffer(sources[i].url);
      let ext = sources[i].ext || null;

      // ตำแหน่งเลือกต่อรูป ไม่ใช่ต่องาน — การ์ดคำคมคนละสไตล์มีที่ว่างคนละมุม
      // null = รูปนี้ห้ามแปะ (การ์ดพื้นสีมีโลโก้อยู่ในดีไซน์แล้ว)
      const pos = watermarkPath ? pickWatermarkPos(wmPos, sources[i].quoteStyle) : null;
      if (watermarkPath && pos) {
        const out = await applyWatermark(buffer, {
          imagePath: watermarkPath, position: pos, opacity: 0.8, size: 0.13,
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
 * เพดานอัปโหลดไฟล์ของเซิร์ฟเวอร์ Discord (ไบต์) — โตตามระดับบูสต์
 * discord.js v14 ไม่มี getter ให้ ต้องแปลงจาก `premiumTier` เอง
 */
function discordUploadLimit(guild) {
  const MB = 1024 * 1024;
  if (guild?.premiumTier === 3) return 100 * MB;
  if (guild?.premiumTier === 2) return 50 * MB;
  return 10 * MB;
}

/**
 * ยิง 1 แพลตฟอร์ม — **ที่เดียวที่รู้ว่าแต่ละแพลตฟอร์มต้องเรียกฟังก์ชันไหน**
 *
 * @param {object} o
 * @param {'fb'|'ig'|'threads'|'x'|'news'} o.platform
 * @param {Array<{buffer:Buffer, ext:string}>} [o.images]  โพสต์รูป (ผ่าน prepareImages มาแล้ว)
 * @param {string} [o.videoUrl]   โพสต์วิดีโอ — ต้องเป็น **URL สาธารณะ** (Meta เป็นคนไปดึงเอง)
 * @param {number|null} [o.scheduleTime] unix วินาที (FB เท่านั้น — เจ้าอื่นไม่รองรับ)
 * @param {number|null} [o.accountId] เลือกบัญชีเจาะจง (posts บนเว็บ) · null = เลือกอัตโนมัติเหมือนเดิม
 * @param {number|null} [o.orgId] ใช้หา app creds ของ X เมื่อ org ไม่มี guild (Meta ใช้ token ที่ผูกไว้แล้ว)
 * @param {object} [o.client] discord.js Client — จำเป็นเฉพาะ platform 'news' (หาห้องด้วย channel id
 *   ไม่ผ่าน guild → ส่งข้ามเซิร์ฟในองค์กรเดียวกันได้)
 * @returns {{platform:string, label:string, ok:boolean, url:string|null, error:string|null}}
 */
async function publishOne({
  platform, guildId, orgId = null, userDiscordId, accountId = null,
  images = [], videoUrl = null, videoPath = null, caption = '', scheduleTime = null,
  group = null, client = null, onProgress = noop,
}) {
  const label = PLATFORM_LABEL[platform] || platform;
  const isVideo = !!videoUrl;
  onProgress(`📤 กำลังโพสต์ไปยัง ${label}${isVideo ? ' (วิดีโอ)' : ''}...`);

  try {
    let url = null;
    // ข้อความคอมเมนต์ที่รอคนเอาไปแปะ (FB เท่านั้น · null = โพสต์นี้ไม่มีลิงก์ให้ย้าย)
    let linkComment = null;
    // Threads: โพสต์หลักออกแล้วแต่ท่อนต่อไม่ครบ — ยังนับว่าสำเร็จ (กดซ้ำ = โพสต์ซ้ำ) แต่ต้องไม่เงียบ
    let warning = null;

    if (platform === 'fb') {
      if (isVideo) {
        const res = await postReelsToFacebook(guildId, userDiscordId, videoUrl, caption, onProgress, group, scheduleTime, accountId);
        url = res?.permalink || null;
      } else {
        const res = await postToFacebook(guildId, userDiscordId, images, caption, scheduleTime, group, accountId);
        linkComment = res?.linkComment || null;
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
      warning = res?.warning || null;
    } else if (platform === 'x') {
      const res = isVideo
        ? await postVideoToX(guildId, userDiscordId, videoUrl, caption, group, accountId, orgId)
        : await postToX(guildId, userDiscordId, images, caption, group, accountId, orgId);
      url = res?.url || null;
    } else if (platform === 'news') {
      if (!client) throw new Error('ห้องข่าวสารต้องมี Discord client');
      // resolve ห้องครั้งเดียวที่นี่ — ห้องอาจอยู่คนละเซิร์ฟกับกลุ่ม เพดานอัปโหลดจึงต้องคิดจากเซิร์ฟของ "ห้อง"
      const channel = await fetchNewsChannel(client, { guildId, group, userDiscordId });
      if (!channel) throw new Error('ยังไม่ได้ตั้งค่าห้องข่าวสาร');
      if (isVideo) {
        // แนบไฟล์ตรงถ้ายังมีต้นฉบับบนดิสก์และไม่เกินเพดานของเซิร์ฟเวอร์
        // (ส่งเป็น "ลิงก์" ไม่ได้แล้ว — videoUrl ชี้ media-temp ที่ cleanTempMedia ลบทิ้งใน 24 ชม.
        //  ข้อความในห้องข่าวจะเหลือลิงก์ตาย · ลิงก์ CDN ของ Discord เองยังใช้ได้จึงตกกลับไปใช้ได้)
        let msg = null;
        if (videoPath) {
          try {
            const buffer = await storage.readFile(videoPath);
            if (buffer.length <= discordUploadLimit(channel.guild)) {
              msg = await postNews(channel, {
                content: caption || undefined,
                files: [{ attachment: buffer, name: `video.${storage.extOfPath(videoPath)}` }],
              });
            }
          } catch (err) {
            console.error('[publishPipeline] แนบคลิปเข้าห้องข่าวไม่สำเร็จ ใช้ลิงก์แทน:', err.message);
          }
        }
        if (!msg) msg = await postNews(channel, { content: [caption, videoUrl].filter(Boolean).join('\n') });
        url = msg?.url || null;
      } else {
        // Discord จำกัด 10 ไฟล์/ข้อความ → เกินให้ต่อข้อความถัดไป · ลิงก์ที่คืนคือข้อความแรก
        const files = images.map((p, i) => ({ attachment: p.buffer, name: `image_${i + 1}.${p.ext}` }));
        let firstMsg = null;
        for (let i = 0; i < files.length; i += 10) {
          const msg = await postNews(channel, {
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

    if (warning) console.warn(`[publishPipeline] ${platform} สำเร็จแต่ไม่ครบ:`, warning);
    return { platform, label, ok: true, url, error: null, linkComment, warning };
  } catch (err) {
    return { platform, label, ok: false, url: null, error: err.message, linkComment: null, warning: null };
  }
}

/**
 * เขียนประวัติ 1 แถวต่อ 1 แพลตฟอร์ม (คิวกับประวัติเป็นตารางเดียวกัน — แถว done/failed = ประวัติ)
 * ล้มเหลวไม่โยนต่อ: ประวัติหายดีกว่าโพสต์ที่ยิงออกไปแล้วขึ้น error ให้ user
 */
async function recordHistory(row) {
  try {
    await pool.query(
      `INSERT INTO post_social_history
         (org_id, episode_id, batch_id, platform, social_account_id, guild_id, channel_id,
          wm_type, caption, media, scheduled_at, status, result, group_name,
          created_by, created_by_discord_id, posted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())`,
      [row.orgId || null, row.episodeId || null, row.batchId, row.platform, row.accountId || null,
       row.guildId || null, row.channelId || null, row.wmType || null, row.caption || null,
       JSON.stringify(row.media || []), row.scheduledAt || null, row.status,
       row.url || row.linkComment
         ? JSON.stringify({ url: row.url || null, linkComment: row.linkComment || null })
         : null,
       row.groupName || null,
       row.createdBy || null, row.createdByDiscordId || null]
    );
  } catch (err) {
    console.error('[publishPipeline] เขียนประวัติไม่สำเร็จ:', err.message);
  }
}

/**
 * ยิงหลายแพลตฟอร์มทีละตัว — ตัวหนึ่งล้มไม่ทำให้ตัวอื่นล้ม (คืน result ครบทุกตัว)
 * ⚠️ ยิงเรียงตัว ไม่ขนาน — โควตา API ของ Meta/X เป็นราย token ยิงพร้อมกันเสี่ยงโดน throttle
 *    และ onProgress ที่พิมพ์ทับกันจะอ่านไม่รู้เรื่อง
 * @returns {{results: Array, status: 'success'|'partial'|'failed'}}
 */
async function publishBatch({ platforms = [], recordTo = null, ...ctx }) {
  const results = [];
  const batchId = recordTo?.batchId || randomUUID();
  for (const platform of platforms) {
    const r = await publishOne({ platform, ...ctx });
    results.push(r);
    // recordTo = บริบทที่ใช้เขียนประวัติ (ตะกร้าส่งมา) · ไม่ส่ง = ไม่เขียน (worker อัปเดตแถวเดิมเอง)
    if (recordTo) {
      await recordHistory({
        ...recordTo, batchId, platform,
        accountId: ctx.accountId || null,
        caption: ctx.caption || null,
        scheduledAt: recordTo.scheduledAt || null,
        status: r.ok ? 'done' : 'failed',
        url: r.url,
        linkComment: r.linkComment,
      });
    }
  }
  const okCount = results.filter(r => r.ok).length;
  const status = okCount === results.length ? 'success' : okCount === 0 ? 'failed' : 'partial';
  return { results, status, batchId };
}

module.exports = { prepareImages, loadMediaSources, publishOne, publishBatch, recordHistory, PLATFORM_LABEL };
