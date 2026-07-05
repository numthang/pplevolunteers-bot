/**
 * Phone OTP login — shared helpers สำหรับ /api/auth/phone/request + verify
 * เบอร์เป็น login credential ได้เฉพาะ dc_members.phone ที่ phone_verified_at ไม่ NULL
 * (verify ผ่าน OTP ใน Discord — handlers/verifyHandler.js · แก้เบอร์เองจาก profile = reset)
 */
import pool from '@/db/index.js'
import crypto from 'crypto'

export const SESSION_KEY         = 'web_otp_login'
export const OTP_TTL_MS          = 5 * 60 * 1000
export const MAX_ATTEMPTS        = 5
export const MAX_SENDS_PER_DAY   = 3   // แชร์ quota `otp_quota` กับ bot verify flow
export const RESEND_COOLDOWN_MS  = 60 * 1000

// HMAC ไม่ใช่ sha256 เปล่า — OTP 6 หลักมีแค่ 1M ค่า brute-force ได้ทันทีถ้า DB หลุด
export function hashOtp(otp, discordId) {
  return crypto.createHmac('sha256', process.env.NEXTAUTH_SECRET)
    .update(`${discordId}:web_login:${otp}`).digest('hex')
}

export function validPhone(phone) {
  return /^0[689]\d{8}$/.test(phone || '')
}

/** หาเจ้าของเบอร์ verified — dc_members per-guild มีหลายแถวได้ถ้าเป็นคนเดียวกัน
 *  ต้องได้ discord_id เดียวเท่านั้น (หลายคนใช้เบอร์เดียว = ambiguous → null) */
export async function findOwnerByVerifiedPhone(phone) {
  const { rows } = await pool.query(
    `SELECT DISTINCT discord_id FROM dc_members
      WHERE phone = $1 AND phone_verified_at IS NOT NULL AND discord_id IS NOT NULL`,
    [phone]
  )
  return rows.length === 1 ? rows[0].discord_id : null
}

export async function getUserConfig(discordId, key) {
  const { rows } = await pool.query(
    'SELECT value FROM dc_user_config WHERE discord_id = $1 AND "key" = $2',
    [discordId, key]
  )
  return rows[0]?.value ?? null
}

export async function setUserConfig(discordId, key, value) {
  await pool.query(
    `INSERT INTO dc_user_config (discord_id, "key", value) VALUES ($1, $2, $3)
     ON CONFLICT (discord_id, "key") DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [discordId, key, JSON.stringify(value)]
  )
}
