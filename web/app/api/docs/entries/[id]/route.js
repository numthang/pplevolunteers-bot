import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { updateEntry, deleteEntry } from '@/db/docs/entries.js'

/** PATCH /api/docs/entries/[id] — edit item_type, description, amount (all statuses) */
export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { access } = await getEffectiveIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const { itemType, description, amount } = await req.json()
    await updateEntry(id, { itemType, description, amount })
    return Response.json({ success: true })
  } catch (err) {
    console.error('[PATCH /api/docs/entries/:id]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/** DELETE /api/docs/entries/[id] — only for status='pending' */
export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { access } = await getEffectiveIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const deleted = await deleteEntry(id)
    if (!deleted) return Response.json({ error: 'ลบได้เฉพาะรายการที่ยังไม่เซ็น' }, { status: 400 })
    return Response.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/docs/entries/:id]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
