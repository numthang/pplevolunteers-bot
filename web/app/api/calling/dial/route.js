import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getOrgId } from '@/lib/orgContext.js'
import { logAction } from '@/db/auditLog.js'

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ ok: false }, { status: 401 })
  try {
    const { member_id, campaign_id, contact_type = 'member' } = await req.json()
    const orgId = await getOrgId(session)
    logAction({ orgId, app: 'calling', action: 'calling.dial_initiated', actorId: session.user.userId, targetId: member_id, meta: { campaign_id, contact_type } })
  } catch {}
  return Response.json({ ok: true })
}
