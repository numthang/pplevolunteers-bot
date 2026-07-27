import crypto from 'crypto'
import { normalizePhone } from '@/lib/sendSms.js'
import {
  MAX_ATTEMPTS,
  hashOtp, validPhone, findOwnerByVerifiedPhone, bumpAttempt, clearLoginSession,
} from '@/lib/phoneLoginOtp.js'
import { putNonce } from '@/db/authNonces.js'

// POST /api/auth/phone/verify — เช็ค OTP แล้วออก nonce (keyed user_id) สำหรับ signIn('phone')
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

  const userId = await findOwnerByVerifiedPhone(phone)
  if (!userId) return fail()

  // นับ attempt แบบ atomic ก่อนเทียบ hash — กัน parallel brute force
  const s = await bumpAttempt(userId)
  if (!s || Date.now() > s.expires_at || s.attempts > MAX_ATTEMPTS) return fail()
  if (s.phone !== phone || hashOtp(otp, userId) !== s.otp_hash) return fail()

  await clearLoginSession(userId)

  // ออก nonce ให้ client ใช้กับ signIn('phone', { nonce }) — pattern เดียวกับ passkey (userNonceAuthorize)
  const nonce = crypto.randomUUID()
  await putNonce(nonce, { userId, purpose: 'phone' })

  return Response.json({ nonce })
}
