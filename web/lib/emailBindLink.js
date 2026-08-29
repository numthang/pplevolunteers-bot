/**
 * Email bind link — owner ผูก email ใหม่ให้ "สมาชิกคนอื่น" (admin-initiated)
 * ต่างจาก /api/org/auth/magic (ประตู login — จับคู่/สร้าง user จาก email เอง):
 * ตัวนี้ผูก email เข้ากับ user_id ที่กำหนดไว้ล่วงหน้าเท่านั้น — เขียนจริงก็ต่อเมื่อ
 * เจ้าของอีเมลกดลิงก์เอง (พิสูจน์ว่าเข้าถึง inbox ได้) ไม่ใช่ owner พิมพ์แล้ว save ตรงๆ
 */
import pool from '@/db/index.js'
import crypto from 'crypto'

export const LINK_TTL_MS = 15 * 60 * 1000
const PURPOSE = 'email_bind'

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ออก token ผูก user_id + email · เก็บ orgId/actorUserId ไว้แค่ทำ audit log ตอน consume
export async function createBindToken(userId, email, orgId, actorUserId) {
  const token = crypto.randomBytes(32).toString('hex')
  await pool.query(
    `INSERT INTO auth_nonces (nonce, user_id, purpose, payload) VALUES ($1, $2, $3, $4)`,
    [token, userId, PURPOSE, JSON.stringify({ email, orgId, actorUserId })]
  )
  // ตั๋วเก่าที่ไม่มีใครคลิกไม่มีใครเก็บ — กวาดทิ้งเป็นครั้งคราวเหมือน org_login_tokens
  pool.query(
    `DELETE FROM auth_nonces WHERE purpose = $1 AND created_at < NOW() - INTERVAL '1 day'`, [PURPOSE]
  ).catch(() => {})
  return token
}

// เขียน email ให้ user_id ที่ผูก token ไว้ + ลบ token (ใช้ได้ครั้งเดียว)
// 23505 = อีเมลนี้ผูกกับ user คนอื่นไปแล้ว (uq_users_email) → already_taken
export async function consumeBindToken(token) {
  const { rows } = await pool.query(
    `SELECT user_id, payload, created_at FROM auth_nonces WHERE nonce = $1 AND purpose = $2`,
    [token, PURPOSE]
  )
  const row = rows[0]
  if (!row) return { error: 'invalid' }

  await pool.query(`DELETE FROM auth_nonces WHERE nonce = $1`, [token])
  if (Date.now() - new Date(row.created_at).getTime() > LINK_TTL_MS) {
    return { error: 'expired' }
  }

  const { email, orgId, actorUserId } = row.payload
  try {
    await pool.query(`UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2`, [email, row.user_id])
  } catch (err) {
    if (err.code === '23505') return { error: 'already_taken' }
    throw err
  }
  return { ok: true, userId: row.user_id, email, orgId, actorUserId }
}
