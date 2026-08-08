import crypto from 'crypto'
import { normalizePhone } from '@/lib/sendSms.js'
import {
  MAX_ATTEMPTS,
  hashOtp, validPhone, findOwnerByVerifiedPhone, bumpAttempt, clearLoginSession,
} from '@/lib/phoneLoginOtp.js'
import { putNonce } from '@/db/authNonces.js'
import { logLogin } from '@/db/authLog.js'

// POST /api/auth/phone/verify — เช็ค OTP แล้วออก nonce (keyed user_id) สำหรับ signIn('phone')
// error เดียวกันทุกกรณี (ไม่เจอเบอร์/หมดอายุ/รหัสผิด) — กัน enumeration เหมือน request
export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const phone = normalizePhone(body.phone)
  const otp = String(body.otp || '').trim()
  if (!validPhone(phone) || !/^\d{6}$/.test(otp)) {
    return Response.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  // user เห็นข้อความเดียวกันหมด (กัน enumeration) แต่ log แยกสาเหตุจริงไว้ให้แอดมินไล่ได้
  const fail = async (outcome, userId = null, meta = null) => {
    await logLogin({ provider: 'phone', outcome, userId, identity: phone, req, meta })
    return Response.json(
      { error: 'รหัสไม่ถูกต้องหรือหมดอายุ — ลองใหม่ หรือขอรหัสใหม่อีกครั้ง' },
      { status: 400 }
    )
  }

  const userId = await findOwnerByVerifiedPhone(phone)
  if (!userId) return fail('no_owner')

  // นับ attempt แบบ atomic ก่อนเทียบ hash — กัน parallel brute force
  const s = await bumpAttempt(userId)
  if (!s) return fail('no_session', userId)
  if (Date.now() > s.expires_at) return fail('otp_expired', userId)
  if (s.attempts > MAX_ATTEMPTS) return fail('too_many_attempts', userId, { attempts: s.attempts })
  if (s.phone !== phone || hashOtp(otp, userId) !== s.otp_hash) return fail('bad_otp', userId, { attempts: s.attempts })

  await clearLoginSession(userId)

  // ออก nonce ให้ client ใช้กับ signIn('phone', { nonce }) — pattern เดียวกับ passkey (userNonceAuthorize)
  const nonce = crypto.randomUUID()
  await putNonce(nonce, { userId, purpose: 'phone' })

  // OTP ผ่านแล้ว — ยังไม่ใช่ session (client ต้องเอา nonce ไป signIn ต่อ)
  // ถ้าเห็น otp_ok แต่ไม่มี ok ตามมา = ตายตรงขั้นแลก session ไม่ใช่ที่ OTP
  await logLogin({ provider: 'phone', outcome: 'otp_ok', userId, identity: phone, req })
  return Response.json({ nonce })
}
