import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canAccessEvent } from '@/lib/docsAccess.js'
import { updateEntry, deleteEntry, getEntryByIdSimple, resetRecipientSignature, autoAssignPayers, reassignEntryPayer } from '@/db/docs/entries.js'
import { getPayersForEvent } from '@/db/docs/payers.js'

/** PATCH /api/docs/entries/[id] — แก้ไขได้ทุกสถานะ (จำกัดด้วย scope จังหวัด) */
export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { access } = await getEffectiveIdentity(session)

  try {
    const { id } = await params
    const entry = await getEntryByIdSimple(id)
    if (!entry) return Response.json({ error: 'Not found' }, { status: 404 })
    if (!canAccessEvent(entry.province, access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const { itemType, description, amount, memberDiscordId, payerDiscordId } = await req.json()
    const recipientChanged = memberDiscordId && memberDiscordId !== entry.member_discord_id
    if (recipientChanged && entry.status === 'signed') {
      await resetRecipientSignature(id)
    }
    await updateEntry(id, { itemType, description, amount, memberDiscordId })

    if (recipientChanged) {
      if (!entry.member_discord_id) {
        // เพิ่งกำหนดผู้รับให้ entry ที่เคยว่าง → resolve payer ทันที (idempotent แตะเฉพาะ payer ว่าง)
        await autoAssignPayers(entry.project_id, entry.guild_id, entry.province ?? null)
      } else if (memberDiscordId === entry.payer_discord_id) {
        // ผู้รับใหม่ == ผู้จ่ายของ entry นี้ → สลับ payer เป็นคนถัดไปใน pool ที่ ≠ ผู้รับ
        const poolPayers = await getPayersForEvent(entry.guild_id, entry.province ?? null)
        const next = poolPayers.find(p => p.discord_id !== memberDiscordId)?.discord_id
        if (next) await reassignEntryPayer(id, next)
      }
    } else if (payerDiscordId && payerDiscordId !== entry.payer_discord_id) {
      // เปลี่ยนผู้จ่ายตรงๆ จาก edit form dropdown
      await reassignEntryPayer(id, payerDiscordId)
    }
    return Response.json({ success: true, resetSignature: recipientChanged && entry.status === 'signed' })
  } catch (err) {
    console.error('[PATCH /api/docs/entries/:id]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/** DELETE /api/docs/entries/[id] — ลบได้ทุกสถานะ (จำกัดด้วย scope จังหวัด) */
export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { access } = await getEffectiveIdentity(session)

  try {
    const { id } = await params
    const entry = await getEntryByIdSimple(id)
    if (!entry) return Response.json({ error: 'Not found' }, { status: 404 })
    if (!canAccessEvent(entry.province, access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

    await deleteEntry(id)
    return Response.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/docs/entries/:id]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
