import pool from '../index.js'

/**
 * สำเนาบัตรประชาชนเก็บใน `users.id_card_image` (BYTEA) — **1 คน 1 ใบ**
 * (ย้ายมาจาก org_members per-guild เมื่อ 2026-07-21 — คนมีบัตรใบเดียว ไม่ใช่ใบต่อ server)
 *
 * ⚠️ เก็บใบเดียว = ตัวกันข้ามองค์กรที่เคยได้มาฟรีจาก per-guild storage หายไป
 *    → ทุกจุดที่ "คนอื่น" ขอดูบัตร ต้องผ่าน `isMemberOfOrg()` ก่อนเสมอ (PDPA ข้าม tenant)
 */

/** บันทึก/แทนที่รูปบัตรของคนนี้ · คืน true ถ้ามี users row ให้อัปเดต */
export async function saveIdCard(userId, imageBuffer) {
  if (!userId) return false
  const { rowCount } = await pool.query(
    `UPDATE users SET id_card_image = $1 WHERE id = $2`,
    [imageBuffer, userId]
  )
  return rowCount > 0
}

/** ดึงรูปบัตร (Buffer) — null ถ้าไม่มี */
export async function getIdCard(userId) {
  if (!userId) return null
  const { rows } = await pool.query(
    `SELECT id_card_image FROM users WHERE id = $1`,
    [userId]
  )
  return rows[0]?.id_card_image ?? null
}

/**
 * เจ้าของบัตรเป็นสมาชิกของ org นี้จริงไหม — ด่านกัน PDPA ข้าม tenant
 * (คนมีสิทธิ์ docs ที่ org B ต้องดูบัตรของคนใน org B เท่านั้น)
 */
export async function isMemberOfOrg(userId, orgId) {
  if (!userId || !orgId) return false
  const { rows } = await pool.query(
    `SELECT 1 FROM org_members WHERE user_id = $1 AND org_id = $2 LIMIT 1`,
    [userId, orgId]
  )
  return rows.length > 0
}
