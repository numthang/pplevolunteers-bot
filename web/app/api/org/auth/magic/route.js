import crypto from 'crypto'
import pool from '@/db/index.js'
import { normalizeEmail, isValidEmail } from '@/db/orgMembers.js'
import { sendEmail } from '@/lib/sendEmail.js'

// POST /api/org/auth/magic — ออก magic-link token ผูก email + ส่งเมล
// มี RESEND_API_KEY/EMAIL_FROM → ส่งจริง · ไม่มี → stub (log link) · dev คืน devLink ให้ทดสอบ
// prod: คืน generic เสมอ (กัน email enumeration)
export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const email = normalizeEmail(body.email)
  if (!isValidEmail(email)) {
    return Response.json({ error: 'อีเมลไม่ถูกต้อง' }, { status: 400 })
  }

  const token = crypto.randomBytes(32).toString('hex')
  await pool.query(
    `INSERT INTO org_login_tokens (token, email) VALUES ($1, $2)`,
    [token, email]
  )

  const origin = new URL(req.url).origin
  const link = `${origin}/org/verify?token=${token}`
  const dev = process.env.NODE_ENV !== 'production'

  await sendEmail({
    to: email,
    subject: 'ลิงก์เข้าสู่ระบบ PLATFOR{m}',
    text: `เข้าสู่ระบบด้วยลิงก์นี้ (หมดอายุใน 15 นาที):\n${link}\n\nถ้าคุณไม่ได้ขอเข้าสู่ระบบ ละเว้นอีเมลนี้ได้เลย`,
    html: `<p>เข้าสู่ระบบด้วยลิงก์นี้ (หมดอายุใน 15 นาที):</p>
<p><a href="${link}">เข้าสู่ระบบ →</a></p>
<p style="color:#888;font-size:13px">ถ้าคุณไม่ได้ขอเข้าสู่ระบบ ละเว้นอีเมลนี้ได้เลย</p>`,
  })

  return Response.json(dev ? { ok: true, devLink: link } : { ok: true })
}
