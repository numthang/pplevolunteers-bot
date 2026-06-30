import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getGuildId } from '@/lib/guildContext.js'
import { logAction } from '@/db/auditLog.js'

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ ok: false }, { status: 401 })
  try {
    const { member_id, campaign_id, contact_type = 'member' } = await req.json()
    const guildId = await getGuildId(session)
    logAction({ guildId, app: 'calling', action: 'calling.dial_initiated', actorId: session.user.discordId, targetId: member_id, meta: { campaign_id, contact_type } })
  } catch {}
  return Response.json({ ok: true })
}
