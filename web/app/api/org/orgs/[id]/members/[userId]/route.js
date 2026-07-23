import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership, setMemberRole, removeMember } from '@/db/orgMembers.js'

const ROLES = ['owner', 'member']
const errMsg = { last_owner: 'ต้องมี owner อย่างน้อย 1 คน', not_found: 'ไม่พบสมาชิก' }

// PATCH /api/org/orgs/[id]/members/[userId] — เปลี่ยน role (owner only)
export async function PATCH(req, { params }) {
  const session = await getOrgSession()
  const me = session?.user?.userId
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { id, userId } = await params
  const orgId = Number(id); const target = Number(userId)
  const membership = await getOrgMembership(orgId, me)
  if (!membership || membership.status !== 'active' || membership.role !== 'owner') {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  if (!ROLES.includes(body.role)) return Response.json({ error: 'role ไม่ถูกต้อง' }, { status: 400 })

  const res = await setMemberRole(orgId, target, body.role)
  if (res.error) return Response.json({ error: errMsg[res.error] || res.error }, { status: 400 })
  return Response.json({ member: res.member })
}

// DELETE /api/org/orgs/[id]/members/[userId] — ลบสมาชิก (owner ลบใครก็ได้ / ทุกคนลบตัวเอง = leave)
export async function DELETE(req, { params }) {
  const session = await getOrgSession()
  const me = session?.user?.userId
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { id, userId } = await params
  const orgId = Number(id); const target = Number(userId)
  const membership = await getOrgMembership(orgId, me)
  if (!membership || membership.status !== 'active') {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }
  if (membership.role !== 'owner' && target !== me) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const res = await removeMember(orgId, target)
  if (res.error) return Response.json({ error: errMsg[res.error] || res.error }, { status: 400 })
  return Response.json({ ok: true })
}
