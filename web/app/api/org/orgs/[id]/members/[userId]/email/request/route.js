import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership } from '@/db/orgMembers.js'
import pool from '@/db/index.js'
import { sendEmail } from '@/lib/sendEmail.js'
import { normalizeEmail, isValidEmail, createBindToken } from '@/lib/emailBindLink.js'
import { logAction } from '@/db/auditLog.js'

// POST .../email/request — owner ส่งลิงก์ยืนยัน email ใหม่ให้สมาชิก
// เขียน users.email จริงก็ต่อเมื่อสมาชิกกดลิงก์เอง (ดู /api/org/link-email) —
// owner พิมพ์เบอร์/อีเมลผิดก็แค่ลิงก์ไม่ถึงคนที่ตั้งใจ ไม่มีการเขียนข้อมูลมั่ว
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

  const email = normalizeEmail((await req.json().catch(() => ({}))).email)
  if (!isValidEmail(email)) return Response.json({ error: 'อีเมลไม่ถูกต้อง' }, { status: 400 })

  const { rows: memberRows } = await pool.query(
    `SELECT 1 FROM org_members WHERE org_id = $1 AND user_id = $2`, [orgId, target]
  )
  if (!memberRows[0]) return Response.json({ error: 'ไม่พบสมาชิกใน org นี้' }, { status: 404 })

  const token = await createBindToken(target, email, orgId, me)
  const origin = new URL(req.url).origin
  const link = `${origin}/org/link-email?token=${token}`
  const dev = process.env.NODE_ENV !== 'production'

  await sendEmail({
    to: email,
    subject: 'ยืนยันอีเมลสำหรับเข้าสู่ระบบ PLATFOR{m}',
    text: `องค์กรของคุณขอผูกอีเมลนี้เข้ากับบัญชีเข้าสู่ระบบ กดลิงก์นี้เพื่อยืนยัน (หมดอายุใน 15 นาที):\n${link}\n\nถ้าคุณไม่รู้จักคำขอนี้ ละเว้นอีเมลนี้ได้เลย`,
    html: `<p>องค์กรของคุณขอผูกอีเมลนี้เข้ากับบัญชีเข้าสู่ระบบ กดลิงก์นี้เพื่อยืนยัน (หมดอายุใน 15 นาที):</p>
<p><a href="${link}">ยืนยันอีเมล →</a></p>
<p style="color:#888;font-size:13px">ถ้าคุณไม่รู้จักคำขอนี้ ละเว้นอีเมลนี้ได้เลย</p>`,
  })

  logAction({
    orgId, app: 'org', action: 'identity_email_bind_request',
    actorId: me, targetId: `u${target}`, meta: { email },
  })

  return Response.json(dev ? { ok: true, devLink: link } : { ok: true })
}
