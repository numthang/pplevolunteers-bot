import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getGuildId } from '@/lib/guildContext.js'
import { upsertDocProject, getDocProjectByEventId } from '@/db/docs/projects.js'
import { getAttachmentsByProject, createAttachment } from '@/db/docs/attachments.js'
import { cropAndSave, buildRegistrationPdf, getRegPdfPath, getUploadPath } from '@/lib/cropDocument.js'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

async function authCheck(session) {
  const { access } = await getEffectiveIdentity(session)
  return canManageDocs(access)
}

/**
 * POST /api/docs/events/[eventId]/attachments
 * Find-or-create project → upload image (crop) or PDF (direct) → rebuild registration PDF
 */
export async function POST(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await authCheck(session)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { eventId } = await params
  const guildId = await getGuildId(session)

  const formData = await req.formData()
  const file = formData.get('file')
  if (!file || typeof file === 'string') return Response.json({ error: 'No file' }, { status: 400 })

  const allowedImages = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  const isPdf = file.type === 'application/pdf'
  if (!isPdf && !allowedImages.includes(file.type)) {
    return Response.json({ error: 'ไฟล์ต้องเป็นรูปภาพหรือ PDF' }, { status: 400 })
  }

  // find-or-create project
  const projectId = await upsertDocProject({
    guildId,
    actEventCacheId: parseInt(eventId),
    createdBy: session.user.discordId,
  })

  const project = await getDocProjectByEventId(parseInt(eventId), guildId)
  const projectName = project?.project_name || project?.event_name || `project_${projectId}`

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  try {
    if (isPdf) {
      // PDF direct upload — overwrite registration PDF directly
      const pdfPath = getRegPdfPath(projectId, projectName)
      await mkdir(path.dirname(pdfPath), { recursive: true })
      await writeFile(pdfPath, buffer)
      return Response.json({ ok: true, type: 'pdf' }, { status: 201 })
    }

    // Image upload — crop + save as attachment
    const filePath = await cropAndSave(buffer, projectId)
    const attachment = await createAttachment(projectId, guildId, {
      originalName: file.name,
      filePath,
    })

    // Rebuild registration PDF (fire-and-forget)
    const allAttachments = await getAttachmentsByProject(projectId)
    buildRegistrationPdf(projectId, projectName, allAttachments.map(a => a.file_path)).catch(e =>
      console.error('[buildRegistrationPdf after upload]', e.message)
    )

    return Response.json(attachment, { status: 201 })
  } catch (err) {
    console.error('[POST events/attachments]', err)
    return Response.json({ error: 'Upload failed' }, { status: 500 })
  }
}
