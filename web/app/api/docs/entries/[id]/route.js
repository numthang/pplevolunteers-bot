import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canAccessEvent } from '@/lib/docsAccess.js'
import { updateEntry, deleteEntry, getEntryByIdSimple, resetRecipientSignature } from '@/db/docs/entries.js'

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

    const { itemType, description, amount, memberDiscordId } = await req.json()
    if (memberDiscordId && memberDiscordId !== entry.member_discord_id && entry.status === 'signed') {
      await resetRecipientSignature(id)
    }
    await updateEntry(id, { itemType, description, amount, memberDiscordId })
    return Response.json({ success: true, resetSignature: memberDiscordId && memberDiscordId !== entry.member_discord_id && entry.status === 'signed' })
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
