import { getOrgSession } from '@/lib/orgAuth.js'
import { listUserOrgs, createOrg } from '@/db/orgMembers.js'

// GET /api/org/orgs — org ทั้งหมดของ user (active + invited)
export async function GET() {
  const session = await getOrgSession()
  const userId = session?.user?.userId
  if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 })
  return Response.json({ orgs: await listUserOrgs(userId) })
}

// POST /api/org/orgs — สร้าง org ใหม่ (self-serve, creator = owner)
export async function POST(req) {
  const session = await getOrgSession()
  const userId = session?.user?.userId
  if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  if (name.length < 2) return Response.json({ error: 'ชื่อองค์กรสั้นเกินไป' }, { status: 400 })

  const org = await createOrg(name, userId)
  return Response.json({ org })
}
