// web/db/posts/jobs.js — งานโพสต์ (คิว) ของ posts
//
// คิวกับประวัติอยู่ตารางเดียวกัน `post_social_history` (เคาะ 2026-07-29):
//   pending/running = คิว · done/failed/stale/canceled = ประวัติ
// **เว็บไม่ยิงโซเชียลเอง** — เขียนแถว pending แล้ว services/publishWorker.js (ฝั่งบอท) เป็นคนหยิบไปยิง
//   → คอลัมน์ในไฟล์นี้ต้องตรงกับที่ worker อ่าน (platform, media, guild_id, social_account_id,
//     created_by_discord_id, group_name, caption, scheduled_at) ห้ามเปลี่ยนชื่อฝ่ายเดียว
// 1 แถว = 1 แพลตฟอร์ม · แถวที่กดพร้อมกันมัดด้วย batch_id เดียว (retry รายแพลตฟอร์มได้)
import { randomUUID } from 'crypto'
import pool from '../index.js'

const COLS = `
  id, org_id, episode_id, batch_id, platform, social_account_id, guild_id, channel_id,
  wm_type, caption, media, scheduled_at, status, attempts, last_error, result, group_name,
  created_by, created_by_discord_id, created_at, updated_at, posted_at`

/**
 * สร้างงานโพสต์ 1 แถวต่อ 1 แพลตฟอร์ม (batch เดียวกัน)
 *
 * @param {object} o
 * @param {string[]} o.platforms  'fb'|'ig'|'threads'|'x'|'news' (route ตรวจค่ามาแล้ว)
 * @param {Array<{kind:string, path:string}>} o.media  snapshot ตอนกดโพสต์ — worker อ่านไฟล์จาก path นี้
 * @param {string|Date|null} o.scheduledAt  ส่งสตริงเวลาไทยตรงๆ ให้ pg แปลง (DB timezone = Asia/Bangkok)
 * @param {number|null} o.accountId  บัญชีโซเชียลที่เลือกเอง — **route ต้องตรวจ org แล้วเท่านั้น**
 * @param {string|null} o.accountPlatform  แพลตฟอร์มของบัญชีนั้น · ใส่ = ผูก accountId เฉพาะแถวที่ตรงกัน
 *        (แถวแพลตฟอร์มอื่นปล่อย NULL ให้ฝั่งบอทเลือกบัญชีอัตโนมัติเหมือนเดิม ไม่งั้นได้ config ไม่ตรง = ล้มแน่)
 * @returns {Promise<object[]>} แถวที่เพิ่งสร้าง
 */
export async function createJobs({
  orgId, episodeId, platforms, accountId = null, accountPlatform = null,
  guildId = null, channelId = null, caption = null, media = [],
  scheduledAt = null, wmType = null, groupName = null,
  createdBy = null, createdByDiscordId = null,
}) {
  const batchId = randomUUID()
  const accountIds = platforms.map(p =>
    accountId && (!accountPlatform || p === accountPlatform) ? accountId : null
  )

  const { rows } = await pool.query(
    `INSERT INTO post_social_history
       (org_id, episode_id, batch_id, platform, social_account_id, guild_id, channel_id,
        wm_type, caption, media, scheduled_at, group_name, created_by, created_by_discord_id,
        status, attempts)
     SELECT $1, $2, $3, j.platform, j.account_id, $6, $7,
            $8, $9, $10::jsonb, $11::timestamptz, $12, $13, $14,
            'pending', 0
       FROM unnest($4::varchar[], $5::int[]) AS j(platform, account_id)
     RETURNING ${COLS}`,
    [orgId || null, episodeId, batchId, platforms, accountIds, guildId || null, channelId || null,
     wmType || null, caption || null, JSON.stringify(media || []), scheduledAt || null,
     groupName || null, createdBy || null, createdByDiscordId || null]
  )
  // unnest ไม่การันตีลำดับ RETURNING → เรียงตาม platforms ที่ผู้เรียกส่งมาเพื่อให้ UI แสดงตามที่กด
  return platforms.map(p => rows.find(r => r.platform === p)).filter(Boolean)
}

/** งานทั้งหมดของโพสต์ (ใหม่สุดก่อน) — ทั้งที่ยังไม่ยิงและที่ยิงไปแล้ว */
export async function listJobs(episodeId) {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM post_social_history
      WHERE episode_id = $1
      ORDER BY created_at DESC, id DESC`,
    [episodeId]
  )
  return rows
}

export async function getJob(id) {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM post_social_history WHERE id = $1`,
    [id]
  )
  return rows[0] || null
}

/**
 * ลองใหม่ — คืนคิวเฉพาะแถวที่จบเกมแล้วจริง (failed / stale)
 * เงื่อนไขอยู่ใน WHERE ไม่ใช่ใน JS: กัน race กับ worker ที่อาจเพิ่งเปลี่ยนแถวเป็น running
 * @returns {Promise<object|null>} null = แถวไม่อยู่ในสถานะที่ลองใหม่ได้
 */
export async function retryJob(id) {
  const { rows } = await pool.query(
    `UPDATE post_social_history
        SET status = 'pending', attempts = 0, last_error = NULL, updated_at = now()
      WHERE id = $1 AND status IN ('failed', 'stale')
      RETURNING ${COLS}`,
    [id]
  )
  return rows[0] || null
}

/** ยกเลิก — ได้เฉพาะแถวที่ยังไม่ถูกหยิบไปยิง (pending) · null = สายเกินไปแล้ว */
export async function cancelJob(id) {
  const { rows } = await pool.query(
    `UPDATE post_social_history
        SET status = 'canceled', updated_at = now()
      WHERE id = $1 AND status = 'pending'
      RETURNING ${COLS}`,
    [id]
  )
  return rows[0] || null
}

/**
 * บัญชีโซเชียลที่ route ใช้ตรวจความเป็นเจ้าของก่อนผูกเข้างาน
 * ⚠️ ด่านนี้คือด่านเดียวของ accountId — ฝั่งบอท (metaApi.getConfigById) เชื่อค่าที่อยู่ในแถวงานเลย
 */
export async function getSocialAccount(id) {
  const { rows } = await pool.query(
    `SELECT id, org_id, guild_id, platform, name, group_name, visibility
       FROM dc_social_accounts WHERE id = $1`,
    [id]
  )
  return rows[0] || null
}

/**
 * มีงานของโพสต์นี้ค้างอยู่ในคิวไหม (กันกดเผยแพร่ซ้ำ → โพสต์ออก 2 รอบ)
 * นับเฉพาะ pending/running · ถ้าส่ง platforms มาจะเช็คเฉพาะแพลตฟอร์มที่ซ้ำกัน
 */
export async function activePlatforms(episodeId, platforms = null) {
  const params = [episodeId]
  let sql = `SELECT DISTINCT platform FROM post_social_history
              WHERE episode_id = $1 AND status IN ('pending','running')`
  if (platforms?.length) {
    params.push(platforms)
    sql += ` AND platform = ANY($${params.length})`
  }
  const { rows } = await pool.query(sql, params)
  return rows.map(r => r.platform)
}
