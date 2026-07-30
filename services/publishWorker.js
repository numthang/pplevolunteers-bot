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
const { prepareImages, loadMediaSources, publishOne, PLATFORM_LABEL } = require('./publishPipeline');
const { cleanTempMedia } = require('./metaApi');
const { refreshAttachmentUrls } = require('./discordAttachments');

const POLL_MS = 30 * 1000;
const BATCH   = 5;                       // หยิบทีละ 5 แถว กัน API rate limit
const MAX_ATTEMPTS = 3;                  // ล้มครบ 3 ครั้ง = failed ถาวร (grill ข้อ 8)
const GRACE_MS = 2 * 60 * 60 * 1000;     // เลยเวลาเกิน 2 ชม. = stale ไม่ยิงเอง (grill ข้อ 15)
const CLEANUP_MS = 24 * 60 * 60 * 1000;  // เก็บกวาด media-temp วันละครั้ง
const REPO_ROOT = path.join(__dirname, '..');
const WATERMARK_DIR = path.join(REPO_ROOT, 'assets', 'watermark');

let timer = null;
let cleanupTimer = null;

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

/**
 * สื่อของงานเป็น snapshot ตอนกดโพสต์ — path เก็บ relative จาก repo root (บอทกับเว็บอ่านดิสก์ก้อนเดียวกัน)
 * ตัวแปลง path/URL → input ของ publishOne อยู่ที่ `publishPipeline.loadMediaSources` ที่เดียว
 * (กติกาข้อ 16 · ตะกร้าดิสฯ ใช้ตัวเดียวกัน) — ที่นี่เหลือแค่ผูกตัวรีเฟรชลิงก์ที่ต้องใช้ discord client
 */
async function loadMedia(job, client = null) {
  return loadMediaSources(Array.isArray(job.media) ? job.media : [], {
    refreshUrls: client ? (urls => refreshAttachmentUrls(client, urls)) : null,
  });
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
  // เก็บกวาดไฟล์ media-temp วันละครั้ง (ไฟล์ที่ Meta ดึงไปแล้วไม่ได้ใช้ต่อ) — เกาะ worker ตัวนี้
  // เพราะเป็นตัวเดียวที่สร้างไฟล์พวกนี้จากฝั่งเว็บ · ไม่ต้องตั้ง cron แยก
  cleanupTimer = setInterval(() => { try { cleanTempMedia(); } catch { /* ปล่อยผ่าน */ } }, CLEANUP_MS);
  try { cleanTempMedia(); } catch { /* ปล่อยผ่าน */ }
  console.log(`[publishWorker] เริ่มทำงาน (ทุก ${POLL_MS / 1000} วิ)`);
}

function stopPublishWorker() {
  if (timer) { clearInterval(timer); timer = null; }
  if (cleanupTimer) { clearInterval(cleanupTimer); cleanupTimer = null; }
}

module.exports = { startPublishWorker, stopPublishWorker, runOnce, markStale, claimJobs, resolveWatermark };
