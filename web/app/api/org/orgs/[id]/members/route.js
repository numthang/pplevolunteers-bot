import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership, listOrgMembers } from '@/db/orgMembers.js'

// GET /api/org/orgs/[id]/members — รายชื่อสมาชิก (สมาชิก active ของ org ดูได้)
export async function GET(req, { params }) {
  const session = await getOrgSession()
  const userId = session?.user?.userId
  if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const orgId = Number((await params).id)
  const membership = await getOrgMembership(orgId, userId)
  if (!membership || membership.status !== 'active') {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }
  return Response.json({ members: await listOrgMembers(orgId) })
}
