import crypto from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { sendSms, smsConfigured, normalizePhone } from '@/lib/sendSms.js'
import {
  OTP_TTL_MS, MAX_SENDS_PER_DAY, RESEND_COOLDOWN_MS,
  hashOtp, validPhone, genRef, getBindSession, saveBindSession,
} from '@/lib/phoneBindOtp.js'

// POST /api/profile/phone/request — ขอ OTP เพื่อผูก+ยืนยันเบอร์ให้ user ที่ login อยู่
// ต่างจาก login door: ต้อง login ก่อน → ไม่ต้องกัน enumeration · แต่ยังกัน user สแปม OTP ตัวเอง (ค่า SMS)
export async function POST(req) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.userId
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (!smsConfigured()) {
    console.error('[phone-bind] SMS gateway ยังไม่ได้ตั้งค่า')
    return Response.json({ error: 'ระบบ SMS ยังไม่พร้อม — ติดต่อแอดมิน' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const phone = normalizePhone(body.phone)
  if (!validPhone(phone)) {
    return Response.json({ error: 'รูปแบบเบอร์ไม่ถูกต้อง — ต้องเป็นเบอร์มือถือไทย 10 หลัก เช่น 0812345678' }, { status: 400 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const prev = await getBindSession(userId)
  const sentToday = prev?.day === today ? (prev.count || 0) : 0

  if (sentToday >= MAX_SENDS_PER_DAY) {
    return Response.json({ error: `ขอรหัสครบ ${MAX_SENDS_PER_DAY} ครั้งของวันนี้แล้ว — ลองใหม่พรุ่งนี้` }, { status: 429 })
  }
  if (prev?.sent_at && Date.now() - prev.sent_at < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - prev.sent_at)) / 1000)
    return Response.json({ error: `เพิ่งส่งรหัสไปแล้ว — รออีก ${wait} วินาที`, ref: prev.ref }, { status: 429 })
  }

  const otp = String(crypto.randomInt(100000, 1000000))
  const ref = genRef()
  const res = await sendSms({
    msisdn: phone,
    message: `รหัสยืนยันเบอร์: ${otp} (Ref: ${ref}) ใช้ได้ 5 นาที`,
  }).catch(err => ({ error: err.message }))
  if (res?.error || res?.bad_phone_number_list?.length) {
    console.error('[phone-bind] SMS ส่งไม่สำเร็จ:', JSON.stringify(res))
    return Response.json({ error: 'ส่ง SMS ไม่สำเร็จ — ลองใหม่อีกครั้ง' }, { status: 502 })
  }

  await saveBindSession(userId, {
    phone,
    otp_hash: hashOtp(otp, userId),
    ref,
    attempts: 0,
    sent_at: Date.now(),
    expires_at: Date.now() + OTP_TTL_MS,
    day: today,
    count: sentToday + 1,
  })

  return Response.json({ ok: true, ref })
}
