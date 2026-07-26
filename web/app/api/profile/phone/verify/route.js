import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { normalizePhone } from '@/lib/sendSms.js'
import {
  MAX_ATTEMPTS, hashOtp, validPhone,
  bumpAttempt, clearBindSession, setVerifiedPhone,
} from '@/lib/phoneBindOtp.js'

// POST /api/profile/phone/verify — เช็ค OTP แล้วเขียนเบอร์ verified ให้ user ที่ login อยู่
export async function POST(req) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.userId
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const phone = normalizePhone(body.phone)
  const otp = String(body.otp || '').trim()
  if (!validPhone(phone) || !/^\d{6}$/.test(otp)) {
    return Response.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const fail = () => Response.json({ error: 'รหัสไม่ถูกต้องหรือหมดอายุ — ลองใหม่ หรือขอรหัสใหม่' }, { status: 400 })

  // นับ attempt แบบ atomic ก่อนเทียบ hash — กัน parallel brute force
  const s = await bumpAttempt(userId)
  if (!s || Date.now() > s.expires_at || s.attempts > MAX_ATTEMPTS) return fail()
  if (s.phone !== phone || hashOtp(otp, userId) !== s.otp_hash) return fail()

  try {
    await setVerifiedPhone(userId, phone)
  } catch (err) {
    if (err.code === 'already_taken') {
      await clearBindSession(userId)
      return Response.json({ error: 'เบอร์นี้ถูกยืนยันกับบัญชีอื่นแล้ว — ติดต่อแอดมินหากคิดว่าไม่ถูกต้อง' }, { status: 409 })
    }
    console.error('[phone-bind] เขียนเบอร์ล้มเหลว:', err)
    return Response.json({ error: 'เกิดข้อผิดพลาด — ลองใหม่อีกครั้ง' }, { status: 500 })
  }

  await clearBindSession(userId)
  return Response.json({ ok: true })
}
