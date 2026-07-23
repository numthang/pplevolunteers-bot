import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership, getOrg, inviteMember, normalizeEmail, isValidEmail } from '@/db/orgMembers.js'
import { sendEmail } from '@/lib/sendEmail.js'

// POST /api/org/orgs/[id]/invite — เชิญด้วย email (สร้าง shell user + org_members invited)
// สิทธิ์: ต้องเป็น owner ของ org (v1) · claim อัตโนมัติตอนเจ้าตัว login email ตรง
export async function POST(req, { params }) {
  const session = await getOrgSession()
  const userId = session?.user?.userId
  if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const orgId = Number((await params).id)
  if (!orgId) return Response.json({ error: 'org ไม่ถูกต้อง' }, { status: 400 })

  const membership = await getOrgMembership(orgId, userId)
  if (!membership || membership.status !== 'active') {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }
  if (membership.role !== 'owner') {
    return Response.json({ error: 'เฉพาะ owner เชิญสมาชิกได้' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const email = normalizeEmail(body.email)
  if (!isValidEmail(email)) return Response.json({ error: 'อีเมลไม่ถูกต้อง' }, { status: 400 })

  const invited = await inviteMember(orgId, email, userId)

  // ส่งเมลเชิญ — ไม่ block/ไม่ fail invite ถ้าเมลล้ม (แถว invited สร้างแล้ว · เจ้าตัว login email ตรง = claim เอง)
  const org = await getOrg(orgId)
  const loginUrl = `${new URL(req.url).origin}/org/login`
  const orgName = org?.name || 'องค์กร'
  const res = await sendEmail({
    to: email,
    subject: `คุณได้รับเชิญเข้าร่วม ${orgName}`,
    text: `คุณได้รับเชิญเข้าร่วม "${orgName}" บน PLATFOR{m}\n\nเข้าสู่ระบบด้วยอีเมลนี้เพื่อรับคำเชิญ:\n${loginUrl}`,
    html: `<p>คุณได้รับเชิญเข้าร่วม <b>${orgName}</b> บน PLATFOR{m}</p>
<p>เข้าสู่ระบบด้วยอีเมลนี้เพื่อรับคำเชิญ:</p>
<p><a href="${loginUrl}">เข้าสู่ระบบ →</a></p>`,
  })

  return Response.json({ invited, emailSent: !res.stubbed && res.ok })
}
