import { getServerSession } from 'next-auth'
import pool from '@/db/index.js'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { getDocProjectByEventId } from '@/db/docs/projects.js'
import { setRecipientGroupPayer, setProjectPayer } from '@/db/docs/entries.js'

/**
 * POST /api/docs/projects/[id]/set-payer   (id = act_event_cache_id)
 * 2 โหมด:
 *  - { recipientDiscordId, payerDiscordId } → override payer ของกลุ่มผู้รับคนเดียว
 *  - { payerDiscordId } เฉยๆ                → ตั้ง payer ระดับโครงการ (default + apply ทุก entry + auto-swap)
 * payer เปลี่ยน + เคยเซ็น → reset ลายเซ็น payer เดิม
 * frontend ยังส่ง *DiscordId (Discord snowflake) — resolve เป็น users.id ก่อนเรียก db layer (คอลัมน์เป็น users.id แล้ว)
 */
export async function POST(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const orgId = await getOrgId(session)
    const project = await getDocProjectByEventId(id, orgId)
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

    const { recipientDiscordId, payerDiscordId } = await req.json()
    if (!payerDiscordId) {
      return Response.json({ error: 'payerDiscordId จำเป็นต้องมี' }, { status: 400 })
    }
    if (recipientDiscordId && recipientDiscordId === payerDiscordId) {
      return Response.json({ error: 'ผู้จ่ายต้องไม่ใช่ผู้รับเงินคนเดียวกัน' }, { status: 400 })
    }

    const neededDiscordIds = [payerDiscordId, ...(recipientDiscordId ? [recipientDiscordId] : [])]
    const { rows: userRows } = await pool.query(
      `SELECT id, discord_id FROM users WHERE discord_id = ANY($1)`,
      [neededDiscordIds]
    )
    const userIdByDiscord = Object.fromEntries(userRows.map(r => [r.discord_id, r.id]))
    const payerUserId = userIdByDiscord[payerDiscordId]
    if (!payerUserId) return Response.json({ error: 'ไม่พบผู้จ่ายนี้ในระบบ' }, { status: 400 })

    let tokens
    if (recipientDiscordId) {
      // โหมด override รายกลุ่ม
      const recipientUserId = userIdByDiscord[recipientDiscordId]
      if (!recipientUserId) return Response.json({ error: 'ไม่พบผู้รับนี้ในระบบ' }, { status: 400 })
      tokens = await setRecipientGroupPayer(project.id, recipientUserId, payerUserId)
    } else {
      // โหมดระดับโครงการ
      tokens = await setProjectPayer(project.id, payerUserId, orgId, project.province ?? null)
    }

    return Response.json({ success: true, data: { payer_discord_id: payerDiscordId, entries: tokens } })
  } catch (err) {
    console.error('[POST /api/docs/projects/:id/set-payer]', err)
    return Response.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
