/**
 * สี CI ของการ์ดคำคม — ลำดับเดียวกับฝั่งบอท (`db/configResolver.js`): personal > guild > global
 *
 * ⚠️ ฝั่งเว็บต้องมีตัวนี้เอง เพราะ `resolveConfig` ของบอทคีย์ด้วย **discord id** ส่วนเว็บถือ
 *    `users.id` (personal config อยู่ที่ `user_config`) · ไม่มีตัวนี้ = การ์ดที่ทำจากเว็บ
 *    ออกสีส้ม default เสมอแม้ผู้ใช้ตั้งสีไว้แล้ว (bug 2026-08-06)
 *
 * ชั้น guild: โพสต์เป็น org-native ไม่ผูกห้องใดห้องหนึ่ง → ใช้ค่าของ guild ใดก็ได้ในองค์กรนั้น
 * (องค์กรตั้งสี CI ไว้ที่ guild ไหนก็ถือว่าเป็นสีขององค์กร)
 */
import pool from '@/db/index.js'

const KEY = 'quote_ci_accent'
const HEX = /^#[0-9a-fA-F]{6}$/

const clean = v => {
  if (typeof v !== 'string') return null
  // ค่าใน dc_guild_config บางคีย์เก็บเป็น JSON string — เผื่อไว้เหมือนที่ quoteHandler ทำ
  let s = v
  try { const p = JSON.parse(v); if (typeof p === 'string') s = p } catch { /* ค่าดิบอยู่แล้ว */ }
  return HEX.test(s) ? s : null
}

/**
 * @param {number|null} userId users.id ของ session
 * @param {number|null} orgId
 * @returns {Promise<string|null>} '#rrggbb' หรือ null = ใช้ส้ม default ของ renderer
 */
export async function resolveQuoteAccent(userId, orgId) {
  if (userId) {
    const { rows } = await pool.query(
      `SELECT value FROM user_config WHERE user_id = $1 AND "key" = $2`, [userId, KEY]
    )
    const v = clean(rows[0]?.value)
    if (v) return v
  }

  if (orgId) {
    const { rows } = await pool.query(
      `SELECT c.value
         FROM dc_guild_config c
         JOIN dc_guilds g ON g.guild_id = c.guild_id
        WHERE c."key" = $1 AND g.org_id = $2
        ORDER BY c.guild_id
        LIMIT 1`,
      [KEY, orgId]
    )
    const v = clean(rows[0]?.value)
    if (v) return v
  }

  const { rows } = await pool.query(
    `SELECT value FROM dc_guild_config WHERE guild_id = 'global' AND "key" = $1`, [KEY]
  )
  return clean(rows[0]?.value)
}
