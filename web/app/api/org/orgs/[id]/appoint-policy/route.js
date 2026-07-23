import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership } from '@/db/orgMembers.js'
import { getAppointPolicy, setOrgConfig } from '@/db/orgConfig.js'
import pool from '@/db/index.js'

// GET/PUT /api/org/orgs/[id]/appoint-policy — ใครแต่งตั้งบทบาทได้บ้าง (owner only)
// owner + admin แต่งตั้งได้เสมอ (gate) · policy = permission role อื่นที่อนุญาตเพิ่ม
// role ที่เลือกได้ = org_roles ตัด admin (เสมอ) / member,viewer (ไม่มีอำนาจ)

async function ownerGate(params) {
  const session = await getOrgSession()
  const userId = session?.user?.userId
  if (!userId) return { error: 'unauthorized', status: 401 }
  const orgId = Number((await params).id)
  const m = await getOrgMembership(orgId, userId)
  if (!m || m.status !== 'active' || m.role !== 'owner') return { error: 'forbidden', status: 403 }
  return { orgId }
}

async function eligibleRoles() {
  const { rows } = await pool.query(
    `SELECT key, label_th FROM org_roles
      WHERE is_active AND key NOT IN ('admin','member','viewer')
      ORDER BY sort_order`
  )
  return rows.map(r => ({ key: r.key, label: r.label_th }))
}

export async function GET(req, { params }) {
  const g = await ownerGate(params)
  if (g.error) return Response.json({ error: g.error }, { status: g.status })
  const [policy, roles] = await Promise.all([getAppointPolicy(g.orgId), eligibleRoles()])
  // ตัด admin ออกจาก policy ที่โชว์ (admin เป็น implicit เสมอ ไม่ใช่ตัวเลือก)
  return Response.json({ policy: policy.filter(p => p !== 'admin'), roles })
}

export async function PUT(req, { params }) {
  const g = await ownerGate(params)
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const body = await req.json().catch(() => ({}))
  if (!Array.isArray(body.policy)) return Response.json({ error: 'policy ต้องเป็น array' }, { status: 400 })

  const allowed = new Set((await eligibleRoles()).map(r => r.key))
  const clean = [...new Set(body.policy.filter(k => allowed.has(k)))]
  await setOrgConfig(g.orgId, 'appoint_policy', JSON.stringify(clean))
  return Response.json({ policy: clean })
}
