import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { getAttachmentById, deleteAttachment, getAttachmentsByProject } from '@/db/docs/attachments.js'
import { removeFile, buildRegistrationPdf } from '@/lib/cropDocument.js'
import { getDocProjectById } from '@/db/docs/projects.js'

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

  // Rebuild registration PDF after deletion (fire-and-forget)
  const project = await getDocProjectById(await getOrgId(session), id)
  if (project) {
    const remaining = await getAttachmentsByProject(id)
    const projectName = project.project_name || project.event_name || `project_${id}`
    buildRegistrationPdf(id, projectName, remaining.map(a => a.file_path)).catch(e =>
      console.error('[buildRegistrationPdf after delete]', e.message)
    )
  }

  return Response.json({ ok: true })
}
