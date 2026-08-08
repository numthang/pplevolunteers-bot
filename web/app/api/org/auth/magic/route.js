import crypto from 'crypto'
import pool from '@/db/index.js'
import { normalizeEmail, isValidEmail } from '@/db/orgMembers.js'
import { sendEmail } from '@/lib/sendEmail.js'
import { logLogin } from '@/db/authLog.js'

// callbackUrl ต้องเป็น path ภายในเท่านั้น (กัน open-redirect ไป phishing)
// อนุญาต '/x' · บล็อก '//host', '/\host', absolute URL, ค่าอื่นๆ → null (fallback /org ที่หน้า verify)
export function safeCallback(cb) {
  return typeof cb === 'string' && /^\/(?![/\\])/.test(cb) ? cb : null
}

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

  // ตั๋วที่ไม่มีใครคลิกจะค้างตลอดไป (ตอนใช้จริงถูก DELETE...RETURNING ทิ้ง แต่ที่ไม่ถูกใช้ไม่มีใครเก็บ)
  pool.query(`DELETE FROM org_login_tokens WHERE created_at < NOW() - INTERVAL '1 day'`).catch(() => {})

  // known=false คือคนที่ไม่เคยมีในระบบ → คลิกลิงก์แล้วจะได้บัญชีใหม่เลย (ประตูนี้เป็น create-on-login)
  // เก็บไว้ดูว่ามีใครสมัครเข้ามาเองบ้าง · และเป็นสัญญาณ "คนเก่าที่ยังไม่ได้ผูกอีเมล" ที่กำลังจะแตกร่าง
  const { rows: known } = await pool.query(
    `SELECT id, discord_id FROM users WHERE email = $1`, [email]
  ).catch(() => ({ rows: [] }))

  const origin = new URL(req.url).origin
  const cb = safeCallback(body.callbackUrl)
  const link = `${origin}/org/verify?token=${token}${cb ? `&callbackUrl=${encodeURIComponent(cb)}` : ''}`
  const dev = process.env.NODE_ENV !== 'production'

  await sendEmail({
    to: email,
    subject: 'ลิงก์เข้าสู่ระบบ PLATFOR{m}',
    text: `เข้าสู่ระบบด้วยลิงก์นี้ (หมดอายุใน 15 นาที):\n${link}\n\nถ้าคุณไม่ได้ขอเข้าสู่ระบบ ละเว้นอีเมลนี้ได้เลย`,
    html: `<p>เข้าสู่ระบบด้วยลิงก์นี้ (หมดอายุใน 15 นาที):</p>
<p><a href="${link}">เข้าสู่ระบบ →</a></p>
<p style="color:#888;font-size:13px">ถ้าคุณไม่ได้ขอเข้าสู่ระบบ ละเว้นอีเมลนี้ได้เลย</p>`,
  })

  await logLogin({
    provider: 'magic', outcome: 'link_sent', req,
    userId: known[0]?.id || null, identity: email,
    meta: { known: known.length > 0, hasDiscord: !!known[0]?.discord_id },
  })

  return Response.json(dev ? { ok: true, devLink: link } : { ok: true })
}
