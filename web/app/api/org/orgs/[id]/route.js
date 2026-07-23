import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership, renameOrg, setOrgIcon } from '@/db/orgMembers.js'

// PATCH /api/org/orgs/[id] — เปลี่ยนชื่อ และ/หรือ icon (emoji string · '' = ลบ) (owner only)
// รูปอัปโหลด → ใช้ POST /api/org/orgs/[id]/icon แยก
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
  let org = null

  if (typeof body.icon !== 'undefined') {
    const icon = String(body.icon || '').trim()
    if (icon.length > 24) return Response.json({ error: 'ไอคอนยาวเกินไป' }, { status: 400 })
    org = await setOrgIcon(orgId, icon || null)
  }
  if (typeof body.name !== 'undefined') {
    const name = String(body.name || '').trim()
    if (name.length < 2) return Response.json({ error: 'ชื่อองค์กรสั้นเกินไป' }, { status: 400 })
    org = await renameOrg(orgId, name)
  }

  if (!org) return Response.json({ error: 'ไม่มีข้อมูลให้แก้ไข' }, { status: 400 })
  return Response.json({ org })
}
