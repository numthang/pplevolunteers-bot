import crypto from 'crypto'
import pool from '@/db/index.js'
import { normalizePhone } from '@/lib/sendSms.js'
import {
  SESSION_KEY, MAX_ATTEMPTS,
  hashOtp, validPhone, findOwnerByVerifiedPhone, setUserConfig,
} from '@/lib/phoneLoginOtp.js'

// POST /api/auth/phone/verify — เช็ค OTP แล้วออก nonce สำหรับ signIn('phone')
// error เดียวกันทุกกรณี (ไม่เจอเบอร์/หมดอายุ/รหัสผิด) — กัน enumeration เหมือน request
export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const phone = normalizePhone(body.phone)
  const otp = String(body.otp || '').trim()
  if (!validPhone(phone) || !/^\d{6}$/.test(otp)) {
    return Response.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const fail = () => Response.json(
    { error: 'รหัสไม่ถูกต้องหรือหมดอายุ — ลองใหม่ หรือขอรหัสใหม่อีกครั้ง' },
    { status: 400 }
  )

  const discordId = await findOwnerByVerifiedPhone(phone)
  if (!discordId) return fail()

  // นับ attempt แบบ atomic ก่อนเทียบ hash — กัน parallel brute force
  const { rows } = await pool.query(
    `UPDATE dc_user_config
        SET value = jsonb_set(value::jsonb, '{attempts}',
              to_jsonb(COALESCE((value::jsonb->>'attempts')::int, 0) + 1))::json
      WHERE discord_id = $1 AND "key" = $2
      RETURNING value`,
    [discordId, SESSION_KEY]
  )
  const session = rows[0]?.value
  if (!session || Date.now() > session.expires_at || session.attempts > MAX_ATTEMPTS) return fail()
  if (session.phone !== phone || hashOtp(otp, discordId) !== session.otp_hash) return fail()

  await pool.query(
    'DELETE FROM dc_user_config WHERE discord_id = $1 AND "key" = $2',
    [discordId, SESSION_KEY]
  )

  // ออก nonce ให้ client ใช้กับ signIn('phone', { nonce }) — pattern เดียวกับ passkey_nonce
  const nonce = crypto.randomUUID()
  await setUserConfig(discordId, 'phone_nonce', nonce)

  return Response.json({ nonce })
}
