import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getGuildId } from '@/lib/guildContext.js'
import { getDocProjectByEventId } from '@/db/docs/projects.js'
import { setRecipientGroupPayer, setProjectPayer } from '@/db/docs/entries.js'

/**
 * POST /api/docs/projects/[id]/set-payer   (id = act_event_cache_id)
 * 2 โหมด:
 *  - { recipientDiscordId, payerDiscordId } → override payer ของกลุ่มผู้รับคนเดียว
 *  - { payerDiscordId } เฉยๆ                → ตั้ง payer ระดับโครงการ (default + apply ทุก entry + auto-swap)
 * payer เปลี่ยน + เคยเซ็น → reset ลายเซ็น payer เดิม
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

    const { recipientDiscordId, payerDiscordId } = await req.json()
    if (!payerDiscordId) {
      return Response.json({ error: 'payerDiscordId จำเป็นต้องมี' }, { status: 400 })
    }

    let tokens
    if (recipientDiscordId) {
      // โหมด override รายกลุ่ม
      if (recipientDiscordId === payerDiscordId) {
        return Response.json({ error: 'ผู้จ่ายต้องไม่ใช่ผู้รับเงินคนเดียวกัน' }, { status: 400 })
      }
      tokens = await setRecipientGroupPayer(project.id, recipientDiscordId, payerDiscordId)
    } else {
      // โหมดระดับโครงการ
      tokens = await setProjectPayer(project.id, payerDiscordId, guildId, project.province ?? null)
    }

    return Response.json({ success: true, data: { payer_discord_id: payerDiscordId, entries: tokens } })
  } catch (err) {
    console.error('[POST /api/docs/projects/:id/set-payer]', err)
    return Response.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
