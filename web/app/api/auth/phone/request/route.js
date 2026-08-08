import crypto from 'crypto'
import { sendSms, smsConfigured, normalizePhone } from '@/lib/sendSms.js'
import {
  OTP_TTL_MS, MAX_SENDS_PER_DAY, RESEND_COOLDOWN_MS,
  hashOtp, validPhone, genRef, findOwnerByVerifiedPhone, getLoginSession, saveLoginSession,
} from '@/lib/phoneLoginOtp.js'
import { logLogin } from '@/db/authLog.js'

// POST /api/auth/phone/request — ขอ OTP เข้าเบอร์ที่ verify ไว้แล้ว (ไม่ต้องมี discord)
// ตอบ generic เหมือนกันทุกกรณี (ไม่เจอ/quota เต็ม/cooldown/SMS พัง) — หน้า login เป็น public
// ห้ามให้คนนอก enumerate ได้ว่าเบอร์ไหนเป็นสมาชิก (องค์กร movement — รายชื่อ sensitive)
export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const phone = normalizePhone(body.phone)
  if (!validPhone(phone)) {
    return Response.json({ error: 'รูปแบบเบอร์ไม่ถูกต้อง — ต้องเป็นเบอร์มือถือไทย 10 หลัก เช่น 0812345678' }, { status: 400 })
  }

  // ref ต้อง gen + คืนกลับ "ทุกกรณี" — คืนเฉพาะตอนเบอร์มีจริง = รั่วว่าเบอร์นี้อยู่ในระบบ (พัง anti-enumeration)
  const newRef = genRef()
  const genericOk = (ref = newRef) => Response.json({ ok: true, ref })

  if (!smsConfigured()) {
    console.error('[phone-login] SMS gateway ยังไม่ได้ตั้งค่า')
    await logLogin({ provider: 'phone', outcome: 'sms_not_configured', identity: phone, req })
    return genericOk()
  }

  // ⚠️ กรณีนี้คือหลุมที่ทำให้ debug ไม่ได้มาตลอด: คนกรอกเบอร์ที่ไม่มีใน users (หรือมีแต่ยังไม่ verified)
  // จะเห็นหน้าจอ "ส่ง OTP แล้ว" เหมือนสำเร็จทุกอย่าง ทั้งที่ระบบไม่ได้ส่งอะไรเลย แล้วนั่งรอ SMS ที่ไม่มีวันมา
  // anti-enumeration ยังต้องคงไว้ (ห้ามบอก user) — แต่ต้องจดไว้ให้แอดมินเห็น
  const userId = await findOwnerByVerifiedPhone(phone)
  if (!userId) {
    await logLogin({ provider: 'phone', outcome: 'no_owner', identity: phone, req })
    return genericOk()
  }

  // quota รายวัน + cooldown เก็บใน session payload (auth_nonces ต่อ user_id)
  const today = new Date().toISOString().slice(0, 10)
  const prev = await getLoginSession(userId)
  const sentToday = prev?.day === today ? (prev.count || 0) : 0

  // ไม่ส่ง SMS ใหม่ (quota เต็ม / ยัง cooldown) → คืน ref ของ SMS ที่ส่งไปก่อนหน้า
  // เพื่อให้เลขบนจอตรงกับ SMS ที่ user ถืออยู่จริง ไม่ใช่ ref ใหม่ที่ไม่มีใน SMS ฉบับไหนเลย
  if (sentToday >= MAX_SENDS_PER_DAY) {
    await logLogin({ provider: 'phone', outcome: 'quota_exceeded', userId, identity: phone, req, meta: { sentToday } })
    return genericOk(prev?.ref || newRef)
  }
  if (prev?.sent_at && Date.now() - prev.sent_at < RESEND_COOLDOWN_MS) {
    await logLogin({ provider: 'phone', outcome: 'cooldown', userId, identity: phone, req })
    return genericOk(prev?.ref || newRef)
  }

  const otp = String(crypto.randomInt(100000, 1000000))
  const res = await sendSms({
    msisdn: phone,
    message: `รหัสเข้าสู่ระบบ: ${otp} (Ref: ${newRef}) ใช้ได้ 5 นาที`,
  }).catch(err => ({ error: err.message }))
  if (res?.error || res?.bad_phone_number_list?.length) {
    console.error('[phone-login] SMS ส่งไม่สำเร็จ:', JSON.stringify(res))
    await logLogin({
      provider: 'phone', outcome: 'sms_failed', userId, identity: phone, req,
      meta: { error: res?.error || null, bad: res?.bad_phone_number_list || null },
    })
    return genericOk()
  }

  await saveLoginSession(userId, {
    phone,
    otp_hash: hashOtp(otp, userId),
    ref: newRef,
    attempts: 0,
    sent_at: Date.now(),
    expires_at: Date.now() + OTP_TTL_MS,
    day: today,
    count: sentToday + 1,
  })

  await logLogin({ provider: 'phone', outcome: 'otp_sent', userId, identity: phone, req, meta: { ref: newRef } })
  return genericOk()
}
