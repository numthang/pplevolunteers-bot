import { cookies } from 'next/headers'
import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership } from '@/db/orgMembers.js'
import { ACTIVE_ORG_COOKIE } from '@/lib/activeOrg.js'

// POST /api/org/orgs/switch — เลือก active org (เก็บ cookie) · ต้องเป็น member ที่ active
export async function POST(req) {
  const session = await getOrgSession()
  const userId = session?.user?.userId
  if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const orgId = Number(body.orgId)
  const membership = await getOrgMembership(orgId, userId)
  if (!membership || membership.status !== 'active') {
    return Response.json({ error: 'ไม่ได้เป็นสมาชิก org นี้' }, { status: 403 })
  }

  const jar = await cookies()
  jar.set(ACTIVE_ORG_COOKIE, String(orgId), {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
  })
  return Response.json({ ok: true, orgId })
}
