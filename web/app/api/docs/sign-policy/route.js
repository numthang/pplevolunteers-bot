import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { getDocsSignPolicy, setOrgConfig, DOCS_SIGN_POLICIES } from '@/db/orgConfig.js'

async function gate(session) {
  if (!session?.user?.userId) return { error: 'Unauthorized', status: 401 }
  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return { error: 'Forbidden', status: 403 }
  return { orgId: await getOrgId(session) }
}

/** GET /api/docs/sign-policy — โหมดการเซ็นของ org นี้ */
export async function GET() {
  const g = await gate(await getServerSession(authOptions))
  if (g.error) return Response.json({ error: g.error }, { status: g.status })
  return Response.json({ success: true, data: { policy: await getDocsSignPolicy(g.orgId) } })
}

/** PUT /api/docs/sign-policy — Body: { policy: 'strict' | 'flexible' } */
export async function PUT(req) {
  const g = await gate(await getServerSession(authOptions))
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const { policy } = await req.json().catch(() => ({}))
  if (!DOCS_SIGN_POLICIES.includes(policy)) {
    return Response.json({ error: 'invalid policy' }, { status: 400 })
  }
  await setOrgConfig(g.orgId, 'docs_sign_policy', policy)
  return Response.json({ success: true, data: { policy } })
}
