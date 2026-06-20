import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getGuildId } from '@/lib/guildContext.js'
import { getDocProjectByEventId } from '@/db/docs/projects.js'
import { setProjectPayer } from '@/db/docs/entries.js'

/**
 * POST /api/docs/projects/[id]/set-payer   (id = act_event_cache_id)
 * ตั้งผู้จ่ายเงินสำหรับ project และสร้าง payer_sign_token ให้ทุก entry
 * Body: { payerDiscordId }
 */
export async function POST(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const guildId = await getGuildId(session)
    const project = await getDocProjectByEventId(id, guildId)
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

    const { payerDiscordId } = await req.json()
    if (!payerDiscordId) return Response.json({ error: 'payerDiscordId required' }, { status: 400 })

    const tokens = await setProjectPayer(project.id, payerDiscordId)

    return Response.json({ success: true, data: { payer_discord_id: payerDiscordId, entries: tokens } })
  } catch (err) {
    console.error('[POST /api/docs/projects/:id/set-payer]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
