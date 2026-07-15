import crypto from 'crypto'
import pool from '@/db/index.js'
import { normalizeEmail, isValidEmail } from '@/db/orgMembers.js'

// POST /api/org/auth/magic — ออก magic-link token ผูก email
// dev stub: log link + คืน devLink (ไม่ส่งอีเมลจริง — ยังไม่มี email transport, เคาะ 2026-07-15)
// prod: คืน generic (กัน email enumeration) — ต่อ SMTP ตอนเปิดจริง
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

  // eslint-disable-next-line no-console
  console.log(`[org magic] ${email} → ${link}`)

  return Response.json(dev ? { ok: true, devLink: link } : { ok: true })
}
