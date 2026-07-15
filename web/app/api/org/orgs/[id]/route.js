import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership, renameOrg } from '@/db/orgMembers.js'

// PATCH /api/org/orgs/[id] — เปลี่ยนชื่อ org (owner only)
export async function PATCH(req, { params }) {
  const session = await getOrgSession()
  const userId = session?.user?.userId
  if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const orgId = Number((await params).id)
  const membership = await getOrgMembership(orgId, userId)
  if (!membership || membership.status !== 'active' || membership.role !== 'owner') {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  if (name.length < 2) return Response.json({ error: 'ชื่อองค์กรสั้นเกินไป' }, { status: 400 })

  return Response.json({ org: await renameOrg(orgId, name) })
}
