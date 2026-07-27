/**
 * Phone OTP login — shared helpers สำหรับ /api/auth/phone/request + verify
 * เบอร์เป็น login credential ได้เฉพาะ users.phone ที่ phone_verified_at ไม่ NULL
 * key ด้วย user_id ผ่าน auth_nonces (รองรับ email-only ที่ไม่มี discord) — เหมือน phoneBindOtp
 * (ยืนยันเบอร์: web profile bind หรือ OTP ใน Discord · แก้เบอร์เองจาก profile = reset verified)
 */
import pool from '@/db/index.js'
import crypto from 'crypto'

export const OTP_TTL_MS          = 5 * 60 * 1000
export const MAX_ATTEMPTS        = 5
export const MAX_SENDS_PER_DAY   = 5
export const RESEND_COOLDOWN_MS  = 60 * 1000

const PURPOSE = 'phone_login'

// HMAC ไม่ใช่ sha256 เปล่า — OTP 6 หลักมีแค่ 1M ค่า brute-force ได้ทันทีถ้า DB หลุด
export function hashOtp(otp, userId) {
  return crypto.createHmac('sha256', process.env.NEXTAUTH_SECRET)
    .update(`${userId}:web_login:${otp}`).digest('hex')
}

export function validPhone(phone) {
  return /^0[689]\d{8}$/.test(phone || '')
}

// ref code 4 ตัว — โชว์บนหน้าจอคู่กับใน SMS ให้ user จับคู่ได้ว่า SMS ฉบับไหนตรงกับ session ปัจจุบัน
// (มีปุ่มส่งซ้ำ → ถือ SMS หลายฉบับ แต่ใช้ได้เฉพาะฉบับล่าสุด) · ตัดตัวสับสน I L O 0 1 ออก
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function genRef() {
  let s = ''
  for (let i = 0; i < 4; i++) s += REF_ALPHABET[crypto.randomInt(REF_ALPHABET.length)]
  return s
}

/** หาเจ้าของเบอร์ verified → users.id (ไม่บังคับ discord แล้ว — email-only login เบอร์ได้)
 *  uq_users_phone (partial: verified) การันตี ≤1 แถวอยู่แล้ว · เช็ค ===1 กันเหนียว */
export async function findOwnerByVerifiedPhone(phone) {
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE phone = $1 AND phone_verified_at IS NOT NULL`,
    [phone]
  )
  return rows.length === 1 ? rows[0].id : null
}

// session ต่อ user (1 แถว) — เก็บใน auth_nonces payload · lookup ด้วย (user_id, purpose)
export async function getLoginSession(userId) {
  const { rows } = await pool.query(
    `SELECT payload FROM auth_nonces WHERE user_id = $1 AND purpose = $2`,
    [userId, PURPOSE]
  )
  return rows[0]?.payload ?? null
}

// overwrite session ของ user (ลบเก่า → ใส่ใหม่) · nonce สุ่มเป็น PK ตาราง (ไม่ได้ใช้ lookup)
export async function saveLoginSession(userId, payload) {
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

export async function clearLoginSession(userId) {
  await pool.query(`DELETE FROM auth_nonces WHERE user_id = $1 AND purpose = $2`, [userId, PURPOSE])
}
