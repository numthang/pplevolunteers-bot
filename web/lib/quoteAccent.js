/**
 * สี CI ของการ์ดคำคม — ลำดับขึ้นกับบริบท (เคาะ 2026-08-12):
 *   โพสต์ personal → personal ชนะก่อน (guild > global สำรอง)
 *   โพสต์ org (หรือไม่รู้บริบท)  → guild ชนะก่อน (personal > global สำรอง)
 * เหตุผล: guild ไม่เคยตั้งสีของตัวเองไว้เลย + ใครก็ตามที่ตั้งสีส่วนตัวไว้จะเห็นสีตัวเอง
 * ทับสีองค์กรตลอดไปไม่มีทางชนะ ถ้ายังใช้ personal ชนะก่อนแบบเดิมไม่ว่าบริบทไหน
 *
 * ⚠️ ฝั่งเว็บต้องมีตัวนี้เอง เพราะฝั่งบอท (`db/configResolver.js`) คีย์ด้วย **discord id**
 *    ส่วนเว็บถือ `users.id` (personal config อยู่ที่ `user_config`)
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

async function personalAccent(userId) {
  if (!userId) return null
  const { rows } = await pool.query(
    `SELECT value FROM user_config WHERE user_id = $1 AND "key" = $2`, [userId, KEY]
  )
  return clean(rows[0]?.value)
}

// สีขององค์กร — ตั้งแต่ migration 2026-08-10 หน้า /org/settings/brand เซฟลง `org_config`
// ⚠️ ยังต้องอ่าน `dc_guild_config` เป็น fallback: ค่าที่ตั้งไว้ก่อนย้าย + `serverProvisioner`
//    ยังเขียนคีย์ตระกูลนี้ลง guild อยู่ · อ่านผิดตารางคือบั๊กเดิม (org ตั้งสีแล้วไม่มีผล 2026-08-12)
async function orgAccent(orgId) {
  if (!orgId) return null

  const own = await pool.query(
    `SELECT value FROM org_config WHERE org_id = $1 AND key = $2`, [orgId, KEY]
  )
  const v = clean(own.rows[0]?.value)
  if (v) return v

  const { rows } = await pool.query(
    `SELECT c.value
       FROM dc_guild_config c
       JOIN dc_guilds g ON g.guild_id = c.guild_id
      WHERE c."key" = $1 AND g.org_id = $2
      ORDER BY c.guild_id
      LIMIT 1`,
    [KEY, orgId]
  )
  return clean(rows[0]?.value)
}

async function globalAccent() {
  const { rows } = await pool.query(
    `SELECT value FROM dc_guild_config WHERE guild_id = 'global' AND "key" = $1`, [KEY]
  )
  return clean(rows[0]?.value)
}

/**
 * @param {number|null} userId users.id ของ session
 * @param {number|null} orgId
 * @param {'personal'|'org'} mode ตาม post.visibility — ไม่ส่ง = 'org' (ปลอดภัยกว่า เผื่อเรียกนอกบริบทโพสต์)
 * @returns {Promise<string|null>} '#rrggbb' หรือ null = ใช้ส้ม default ของ renderer
 */
export async function resolveQuoteAccent(userId, orgId, mode = 'org') {
  const [personal, org] = await Promise.all([personalAccent(userId), orgAccent(orgId)])
  const primary   = mode === 'personal' ? personal : org
  const secondary = mode === 'personal' ? org : personal
  return primary || secondary || (await globalAccent())
}
