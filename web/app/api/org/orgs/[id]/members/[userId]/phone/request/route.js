import crypto from 'crypto'
import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership } from '@/db/orgMembers.js'
import pool from '@/db/index.js'
import { sendSms, smsConfigured, normalizePhone } from '@/lib/sendSms.js'
import {
  OTP_TTL_MS, MAX_SENDS_PER_DAY, RESEND_COOLDOWN_MS,
  hashOtp, validPhone, genRef, getBindSession, saveBindSession,
} from '@/lib/phoneBindOtp.js'

// POST .../phone/request — owner ขอ OTP ผูก+ยืนยันเบอร์ให้ "สมาชิกคนอื่น" (ไม่ใช่ตัวเอง)
// รหัสไปที่เบอร์ปลายทางเท่านั้น — owner ต้องได้รหัสจากตัวสมาชิกเอง (โทร/คุยสด) มากรอกยืนยันต่อ
// ไม่ใช่การ bypass ลอยๆ — ยังต้องพิสูจน์ว่าเบอร์นี้ถึงมือสมาชิกจริง
export async function POST(req, { params }) {
  const session = await getOrgSession()
  const me = session?.user?.userId
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { id, userId } = await params
  const orgId = Number(id); const target = Number(userId)
  const membership = await getOrgMembership(orgId, me)
  if (!membership || membership.status !== 'active' || membership.role !== 'owner') {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const { rows: memberRows } = await pool.query(
    `SELECT 1 FROM org_members WHERE org_id = $1 AND user_id = $2`, [orgId, target]
  )
  if (!memberRows[0]) return Response.json({ error: 'ไม่พบสมาชิกใน org นี้' }, { status: 404 })

  if (!smsConfigured()) {
    return Response.json({ error: 'ระบบ SMS ยังไม่พร้อม — ติดต่อแอดมิน' }, { status: 503 })
  }

  const phone = normalizePhone((await req.json().catch(() => ({}))).phone)
  if (!validPhone(phone)) {
    return Response.json({ error: 'รูปแบบเบอร์ไม่ถูกต้อง — ต้องเป็นเบอร์มือถือไทย 10 หลัก เช่น 0812345678' }, { status: 400 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const prev = await getBindSession(target)
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
    return Response.json({ error: 'ส่ง SMS ไม่สำเร็จ — ลองใหม่อีกครั้ง' }, { status: 502 })
  }

  await saveBindSession(target, {
    phone,
    otp_hash: hashOtp(otp, target),
    ref,
    attempts: 0,
    sent_at: Date.now(),
    expires_at: Date.now() + OTP_TTL_MS,
    day: today,
    count: sentToday + 1,
  })

  return Response.json({ ok: true, ref })
}
