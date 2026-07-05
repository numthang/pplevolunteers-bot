import crypto from 'crypto'
import { sendSms, smsConfigured, normalizePhone } from '@/lib/sendSms.js'
import {
  SESSION_KEY, OTP_TTL_MS, MAX_SENDS_PER_DAY, RESEND_COOLDOWN_MS,
  hashOtp, validPhone, findOwnerByVerifiedPhone, getUserConfig, setUserConfig,
} from '@/lib/phoneLoginOtp.js'

// POST /api/auth/phone/request — ขอ OTP เข้าเบอร์ที่ verify ไว้แล้ว
// ตอบ generic เหมือนกันทุกกรณี (ไม่เจอ/quota เต็ม/cooldown/SMS พัง) — หน้า login เป็น public
// ห้ามให้คนนอก enumerate ได้ว่าเบอร์ไหนเป็นสมาชิก (องค์กร movement — รายชื่อ sensitive)
export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const phone = normalizePhone(body.phone)
  if (!validPhone(phone)) {
    return Response.json({ error: 'รูปแบบเบอร์ไม่ถูกต้อง — ต้องเป็นเบอร์มือถือไทย 10 หลัก เช่น 0812345678' }, { status: 400 })
  }

  const genericOk = () => Response.json({ ok: true })

  if (!smsConfigured()) {
    console.error('[phone-login] SMS gateway ยังไม่ได้ตั้งค่า')
    return genericOk()
  }

  const discordId = await findOwnerByVerifiedPhone(phone)
  if (!discordId) return genericOk()

  // quota รายวันแชร์กับ bot verify flow (key otp_quota ต่อ discord_id)
  const today = new Date().toISOString().slice(0, 10)
  const quota = (await getUserConfig(discordId, 'otp_quota')) || {}
  const sentToday = quota.day === today ? (quota.count || 0) : 0
  if (sentToday >= MAX_SENDS_PER_DAY) return genericOk()

  const prev = await getUserConfig(discordId, SESSION_KEY)
  if (prev?.sent_at && Date.now() - prev.sent_at < RESEND_COOLDOWN_MS) return genericOk()

  const otp = String(crypto.randomInt(100000, 1000000))
  const res = await sendSms({
    msisdn: phone,
    message: `รหัสเข้าสู่ระบบ: ${otp} (ใช้ได้ 5 นาที)`,
  }).catch(err => ({ error: err.message }))
  if (res?.error || res?.bad_phone_number_list?.length) {
    console.error('[phone-login] SMS ส่งไม่สำเร็จ:', JSON.stringify(res))
    return genericOk()
  }

  await setUserConfig(discordId, SESSION_KEY, {
    phone,
    otp_hash: hashOtp(otp, discordId),
    attempts: 0,
    sent_at: Date.now(),
    expires_at: Date.now() + OTP_TTL_MS,
  })
  await setUserConfig(discordId, 'otp_quota', { day: today, count: sentToday + 1 })

  return genericOk()
}
