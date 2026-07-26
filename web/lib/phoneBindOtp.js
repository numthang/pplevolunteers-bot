/**
 * Phone bind OTP — ผูก+ยืนยันเบอร์จากหน้า profile (user login อยู่แล้วทุกวิธี)
 * ต่างจาก phoneLoginOtp.js: ตัวนั้นเป็น "login ด้วยเบอร์ที่ verify แล้ว" (key ด้วย discord_id)
 * ตัวนี้เป็น "เพิ่มเบอร์ให้ user ปัจจุบัน" — key ด้วย user_id ผ่าน auth_nonces (รองรับ email-only ที่ไม่มี discord)
 */
import pool from '@/db/index.js'
import crypto from 'crypto'
export { validPhone, genRef } from '@/lib/phoneLoginOtp.js'

export const OTP_TTL_MS         = 5 * 60 * 1000
export const MAX_ATTEMPTS       = 5
export const MAX_SENDS_PER_DAY  = 5
export const RESEND_COOLDOWN_MS  = 60 * 1000

const PURPOSE = 'phone_bind'

// HMAC ไม่ใช่ sha256 เปล่า — OTP 6 หลักมีแค่ 1M ค่า brute-force ได้ทันทีถ้า DB หลุด
export function hashOtp(otp, userId) {
  return crypto.createHmac('sha256', process.env.NEXTAUTH_SECRET)
    .update(`${userId}:phone_bind:${otp}`).digest('hex')
}

// session ต่อ user (1 แถว) — เก็บใน auth_nonces payload · lookup ด้วย (user_id, purpose)
export async function getBindSession(userId) {
  const { rows } = await pool.query(
    `SELECT payload FROM auth_nonces WHERE user_id = $1 AND purpose = $2`,
    [userId, PURPOSE]
  )
  return rows[0]?.payload ?? null
}

// overwrite session ของ user (ลบเก่า → ใส่ใหม่) · nonce สุ่มไม่ได้ใช้ lookup แต่เป็น PK ของตาราง
export async function saveBindSession(userId, payload) {
  await pool.query(`DELETE FROM auth_nonces WHERE user_id = $1 AND purpose = $2`, [userId, PURPOSE])
  await pool.query(
    `INSERT INTO auth_nonces (nonce, user_id, purpose, payload) VALUES ($1, $2, $3, $4)`,
    [crypto.randomUUID(), userId, PURPOSE, JSON.stringify(payload)]
  )
}

// นับ attempt แบบ atomic ก่อนเทียบ hash — กัน parallel brute force · คืน payload หลัง +1
export async function bumpAttempt(userId) {
  const { rows } = await pool.query(
    `UPDATE auth_nonces
        SET payload = jsonb_set(payload, '{attempts}',
              to_jsonb(COALESCE((payload->>'attempts')::int, 0) + 1))
      WHERE user_id = $1 AND purpose = $2
      RETURNING payload`,
    [userId, PURPOSE]
  )
  return rows[0]?.payload ?? null
}

export async function clearBindSession(userId) {
  await pool.query(`DELETE FROM auth_nonces WHERE user_id = $1 AND purpose = $2`, [userId, PURPOSE])
}

// เขียนเบอร์ verified ให้ user นี้ · uq_users_phone (partial) กันเบอร์ซ้ำข้ามคน → 23505 = already_taken
export async function setVerifiedPhone(userId, phone) {
  try {
    await pool.query(
      `UPDATE users SET phone = $1, phone_verified_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [phone, userId]
    )
  } catch (err) {
    if (err.code === '23505') throw Object.assign(new Error('already_taken'), { code: 'already_taken' })
    throw err
  }
}
