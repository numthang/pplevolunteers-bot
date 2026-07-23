import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership, listOrgStaff, searchOrgMembers } from '@/db/orgMembers.js'

// GET /api/org/orgs/[id]/members — governance list (owner/invited/role-holders)
// ?q=... → ค้นหาสมาชิกใน org (LIMIT) แทนการ dump ทั้งก้อน
export async function GET(req, { params }) {
  const session = await getOrgSession()
  const userId = session?.user?.userId
  if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const orgId = Number((await params).id)
  const membership = await getOrgMembership(orgId, userId)
  if (!membership || membership.status !== 'active') {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const q = new URL(req.url).searchParams.get('q')?.trim() || ''
  if (q) {
    if (q.length < 2) return Response.json({ members: [] })
    return Response.json({ members: await searchOrgMembers(orgId, q) })
  }
  return Response.json({ members: await listOrgStaff(orgId) })
}
