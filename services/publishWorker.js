// services/publishWorker.js — คิวโพสต์ของ posts (เว็บเขียนแถว → บอทเป็นคนยิงจริง)
//
// ทำไมเป็นตารางคิวไม่ใช่ HTTP: เว็บกับบอทคนละโปรเซส คนละ package.json (เว็บไม่เคย import services/)
// เขียนแถวลง post_social_history แล้วให้บอทวนหยิบ → ได้ custom scheduler ของ IG/X มาฟรี
// (IG/Threads/X ตั้งเวลาเองไม่ได้ · FB ได้แต่เราไม่ใช้ เพื่อให้ทุกแพลตฟอร์มใช้กลไกเดียวกัน)
//
// กติกาข้อ 16: ยิงจริงผ่าน `publishOne` ของ services/publishPipeline.js เท่านั้น — ที่นี่แค่จัดคิว
const path = require('path');
const fs = require('fs/promises');
const pool = require('../db/index');
const { prepareImages, publishOne, PLATFORM_LABEL } = require('./publishPipeline');
const { saveMediaToTemp } = require('./metaApi');
const { refreshAttachmentUrls } = require('./discordAttachments');

const POLL_MS = 30 * 1000;
const BATCH   = 5;                       // หยิบทีละ 5 แถว กัน API rate limit
const MAX_ATTEMPTS = 3;                  // ล้มครบ 3 ครั้ง = failed ถาวร (grill ข้อ 8)
const GRACE_MS = 2 * 60 * 60 * 1000;     // เลยเวลาเกิน 2 ชม. = stale ไม่ยิงเอง (grill ข้อ 15)
const REPO_ROOT = path.join(__dirname, '..');
const WATERMARK_DIR = path.join(REPO_ROOT, 'assets', 'watermark');

let timer = null;

/** งานที่เลยเวลามานานเกิน grace (บอทดับข้ามคืน) → ไม่ยิงเงียบๆ ให้คนตัดสินใจเอง */
async function markStale() {
  const { rows } = await pool.query(
    `UPDATE post_social_history
        SET status = 'stale', updated_at = now()
      WHERE status = 'pending' AND scheduled_at IS NOT NULL
        AND scheduled_at < now() - ($1 || ' milliseconds')::interval
      RETURNING id, batch_id`,
    [GRACE_MS]
  );
  if (rows.length) console.log(`[publishWorker] ${rows.length} งานเลยเวลาเกิน 2 ชม. → stale`);
  return rows;
}

/** จองงาน — FOR UPDATE SKIP LOCKED เพื่อให้รันหลายอินสแตนซ์พร้อมกันได้โดยไม่โพสต์ซ้ำ */
async function claimJobs() {
  const { rows } = await pool.query(
    `UPDATE post_social_history j
        SET status = 'running', attempts = j.attempts + 1, updated_at = now()
      WHERE j.id IN (
        SELECT id FROM post_social_history
         WHERE status = 'pending'
           AND (scheduled_at IS NULL OR scheduled_at <= now())
         ORDER BY scheduled_at NULLS FIRST, id
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING *`,
    [BATCH]
  );
  return rows;
}

/**
 * ลายน้ำของงาน — เว็บ resolve โฟลเดอร์ให้เสร็จแล้วเก็บมาเป็น `path:<relative จาก assets/watermark>`
 * (ไม่ใช่ token `guild:`/`personal:` แบบตะกร้าดิสฯ เพราะกลุ่มที่เว็บเลือกอาจอยู่คนละ guild
 *  กับ guild ที่ผู้ใช้อยู่ → ให้ฝั่งเว็บเป็นคนตัดสินโฟลเดอร์ ที่นี่แค่ต่อ path)
 * ที่นี่ยังเช็คซ้ำว่าไม่หลุดออกนอก assets/watermark — ค่าในแถวงานคือ input ที่มาจากภายนอก
 */
async function resolveWatermark(wmType) {
  if (!wmType || wmType === 'none' || !wmType.startsWith('path:')) return null;
  const abs = path.resolve(WATERMARK_DIR, wmType.slice('path:'.length));
  if (!abs.startsWith(WATERMARK_DIR + path.sep)) {
    console.error('[publishWorker] ลายน้ำอยู่นอก assets/watermark:', wmType);
    return null;
  }
  try {
    await fs.access(abs);
    return abs;
  } catch {
    console.error('[publishWorker] ไม่พบไฟล์ลายน้ำ:', wmType);   // ไฟล์หาย = โพสต์ต่อแบบไม่มีลายน้ำ ไม่ล้มทั้งงาน
    return null;
  }
}

/** สื่อของงานเป็น snapshot ตอนกดโพสต์ — path เก็บ relative จาก repo root (บอทกับเว็บอ่านดิสก์ก้อนเดียวกัน) */
async function loadMedia(job, client = null) {
  const items = Array.isArray(job.media) ? job.media : [];
  const images = [];
  let videoUrl = null;

  // งานที่มาจากตะกร้าดิสฯ เก็บเป็นลิงก์ CDN ซึ่งหมดอายุ ~24 ชม. — งานตั้งเวลา/กดลองใหม่ทีหลัง
  // จะดึงไม่ได้ถ้าไม่รีเฟรชก่อน (ลิงก์ของเว็บเป็น path ในดิสก์ ไม่เกี่ยว)
  const discordUrls = items.map(m => m.url).filter(Boolean);
  if (discordUrls.length && client) {
    const fresh = await refreshAttachmentUrls(client, discordUrls);
    if (fresh.size) for (const m of items) if (m.url && fresh.has(m.url)) m.url = fresh.get(m.url);
  }

  const safePath = (rel) => {
    const abs = path.resolve(REPO_ROOT, rel);
    if (!abs.startsWith(path.resolve(REPO_ROOT, 'storage') + path.sep)) {
      throw new Error(`สื่ออยู่นอก storage/: ${rel}`);
    }
    return abs;
  };

  for (const m of items) {
    // วิดีโอ: ตะกร้าดิสฯ ส่ง URL ของ Discord มาเลย · เว็บเก็บเป็นไฟล์ใน storage/ ซึ่งไม่มี URL สาธารณะ
    // แต่ IG/Threads/Reels ไม่รับไฟล์อัปโหลดตรง ต้องให้ URL แล้วเขามาดึงเอง
    // → วางลง media-temp (โฟลเดอร์เดียวกับที่รูป IG ใช้อยู่แล้ว) แล้วส่ง URL นั้นไป
    if (m.kind === 'video') {
      if (m.url) { videoUrl = m.url; continue; }
      if (!m.path) continue;
      videoUrl = saveMediaToTemp(await fs.readFile(safePath(m.path)), (m.path.split('.').pop() || 'mp4').toLowerCase());
      // Meta ต้องเข้าถึง URL นี้ได้จากอินเทอร์เน็ต — URL สัมพัทธ์ = ยิงไปก็ล้มแบบงงๆ ฝั่งเขา
      if (!/^https?:\/\//.test(videoUrl)) {
        throw new Error('WEB_BASE_URL (หรือ META_TEMP_URL) ไม่ได้ตั้ง — ส่งวิดีโอจากเว็บให้ Meta ไม่ได้');
      }
      continue;
    }
    if (m.url && !m.path) { images.push({ url: m.url }); continue; }   // ตะกร้าดิสฯ (URL)
    if (!m.path) continue;
    images.push({ buffer: await fs.readFile(safePath(m.path)), ext: (m.path.split('.').pop() || 'jpg').toLowerCase() });
  }
  return { images, videoUrl };
}

async function finishJob(job, result) {
  // ⚠️ ห้ามใช้ $ ตัวเดียวกันทั้งใน SET และใน CASE — PG เดาชนิดไม่ตรงกันแล้วโยน
  //    "inconsistent types deduced for parameter" (เจอตอนเทส) → ส่ง boolean แยกมาเลย
  await pool.query(
    `UPDATE post_social_history
        SET status = $2, result = $3::jsonb, last_error = $4,
            posted_at = CASE WHEN $5 THEN now() ELSE posted_at END,
            updated_at = now()
      WHERE id = $1`,
    [job.id, result.status, result.url ? JSON.stringify({ url: result.url }) : null,
     result.error || null, result.status === 'done']
  );
}

/**
 * แจ้งกลับห้อง Discord ต้นทางเมื่องานทั้ง batch จบ (user สั่ง: "ต้องส่ง backlink กลับไป channel_id นั้นด้วย")
 * best-effort — org ที่ไม่มี Discord หรือห้องถูกลบ = ข้ามเงียบ ไม่ทำให้งานล้ม
 */
async function notifyBatchDone(client, batchId) {
  try {
    const { rows } = await pool.query(
      `SELECT platform, status, result, channel_id, caption
         FROM post_social_history
        WHERE batch_id = $1 ORDER BY id`,
      [batchId]
    );
    if (!rows.length || rows.some(r => ['pending', 'running'].includes(r.status))) return;   // ยังไม่จบทั้ง batch

    const channelId = rows.find(r => r.channel_id)?.channel_id;
    if (!channelId || !client) return;

    const lines = rows.map(r => {
      const label = PLATFORM_LABEL[r.platform] || r.platform;
      if (r.status !== 'done') return `❌ ${label}`;
      const url = r.result?.url;
      return `✅ ${label}${url ? ` · 🔗 [ดูโพสต์](${url})` : ''}`;
    });
    const head = rows[0].caption ? `📤 โพสต์ออกแล้ว — ${rows[0].caption.slice(0, 80)}` : '📤 โพสต์ออกแล้ว';

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased?.()) await channel.send([head, ...lines].join('\n'));
  } catch (err) {
    console.error('[publishWorker] แจ้งกลับห้องไม่สำเร็จ:', err.message);
  }
}

async function runOnce(client) {
  await markStale();
  const jobs = await claimJobs();
  if (!jobs.length) return;

  console.log(`[publishWorker] หยิบงาน ${jobs.length} ชิ้น`);
  const touchedBatches = new Set();

  for (const job of jobs) {
    touchedBatches.add(job.batch_id);
    try {
      const { images, videoUrl } = await loadMedia(job, client);
      const watermarkPath = await resolveWatermark(job.wm_type);
      const { processed, errors } = images.length
        ? await prepareImages(images, { watermarkPath })
        : { processed: [], errors: [] };
      if (images.length && !processed.length) throw new Error(errors.join(' · ') || 'เตรียมรูปไม่สำเร็จ');

      const guild = job.guild_id && client ? await client.guilds.fetch(job.guild_id).catch(() => null) : null;
      const r = await publishOne({
        platform: job.platform,
        guildId: job.guild_id,
        orgId: job.org_id,
        userDiscordId: job.created_by_discord_id,
        accountId: job.social_account_id,
        images: processed,
        videoUrl,
        caption: job.caption || '',
        group: job.group_name,
        guild,
      });

      if (r.ok) {
        await finishJob(job, { status: 'done', url: r.url });
      } else if (job.attempts >= MAX_ATTEMPTS) {
        await finishJob(job, { status: 'failed', error: r.error });
        console.error(`[publishWorker] job ${job.id} (${job.platform}) ล้มถาวรหลัง ${job.attempts} ครั้ง: ${r.error}`);
      } else {
        // ยังไม่ครบโควตา retry → คืนเข้าคิว รอบหน้าค่อยลองใหม่
        await pool.query(
          `UPDATE post_social_history SET status = 'pending', last_error = $2, updated_at = now() WHERE id = $1`,
          [job.id, r.error]
        );
      }
    } catch (err) {
      const terminal = job.attempts >= MAX_ATTEMPTS;
      await pool.query(
        `UPDATE post_social_history SET status = $2, last_error = $3, updated_at = now() WHERE id = $1`,
        [job.id, terminal ? 'failed' : 'pending', err.message]
      );
      console.error(`[publishWorker] job ${job.id} error:`, err.message);
    }
  }

  for (const batchId of touchedBatches) await notifyBatchDone(client, batchId);
}

/** เรียกจาก index.js หลังบอท ready — รับ client ไว้แจ้งกลับห้อง Discord */
function startPublishWorker(client) {
  if (timer) return;
  const tick = () => runOnce(client).catch(err => console.error('[publishWorker]', err.message));
  timer = setInterval(tick, POLL_MS);
  tick();
  console.log(`[publishWorker] เริ่มทำงาน (ทุก ${POLL_MS / 1000} วิ)`);
}

function stopPublishWorker() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { startPublishWorker, stopPublishWorker, runOnce, markStale, claimJobs, resolveWatermark };
