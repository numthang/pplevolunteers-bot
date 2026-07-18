import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership } from '@/db/orgMembers.js'
import { setOrgConfig } from '@/db/orgConfig.js'
import { ORG_FEATURES, ORG_FEATURE_KEYS, getOrgEnabledFeatures } from '@/lib/orgFeatures.js'

// GET/PUT /api/org/orgs/[id]/features — เปิด/ปิด org-native feature (owner only)
async function ownerGate(params) {
  const session = await getOrgSession()
  const userId = session?.user?.userId
  if (!userId) return { error: 'unauthorized', status: 401 }
  const orgId = Number((await params).id)
  const m = await getOrgMembership(orgId, userId)
  if (!m || m.status !== 'active' || m.role !== 'owner') return { error: 'forbidden', status: 403 }
  return { orgId }
}

export async function GET(req, { params }) {
  const g = await ownerGate(params)
  if (g.error) return Response.json({ error: g.error }, { status: g.status })
  return Response.json({ features: ORG_FEATURES, enabled: await getOrgEnabledFeatures(g.orgId) })
}

export async function PUT(req, { params }) {
  const g = await ownerGate(params)
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const body = await req.json().catch(() => ({}))
  if (!Array.isArray(body.enabled)) return Response.json({ error: 'enabled ต้องเป็น array' }, { status: 400 })

  const clean = [...new Set(body.enabled.filter(k => ORG_FEATURE_KEYS.includes(k)))]
  await setOrgConfig(g.orgId, 'enabled_features', JSON.stringify(clean))
  return Response.json({ enabled: clean })
}
