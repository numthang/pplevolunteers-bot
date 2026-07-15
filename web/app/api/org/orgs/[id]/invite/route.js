import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership, inviteMember, normalizeEmail, isValidEmail } from '@/db/orgMembers.js'

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
  return Response.json({ invited })
}
