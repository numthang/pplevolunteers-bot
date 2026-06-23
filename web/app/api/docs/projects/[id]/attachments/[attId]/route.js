import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getAttachmentById, deleteAttachment } from '@/db/docs/attachments.js'
import { removeFile } from '@/lib/cropDocument.js'

/** DELETE /api/docs/projects/[id]/attachments/[attId] */
export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { access } = await getEffectiveIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id, attId } = await params
  const att = await getAttachmentById(attId, id)
  if (!att) return Response.json({ error: 'Not found' }, { status: 404 })

  await deleteAttachment(attId, id)
  await removeFile(att.file_path).catch(() => {})
  return Response.json({ ok: true })
}
