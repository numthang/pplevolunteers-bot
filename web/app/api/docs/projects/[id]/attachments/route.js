import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getGuildId } from '@/lib/guildContext.js'
import { getDocProjectById } from '@/db/docs/projects.js'
import { getAttachmentsByProject, createAttachment } from '@/db/docs/attachments.js'
import { cropAndSave } from '@/lib/cropDocument.js'

async function auth(session) {
  const { access } = await getEffectiveIdentity(session)
  return canManageDocs(access)
}

/** GET /api/docs/projects/[id]/attachments */
export async function GET(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await auth(session)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const attachments = await getAttachmentsByProject(id)
  return Response.json(attachments)
}

/** POST /api/docs/projects/[id]/attachments — multipart upload */
export async function POST(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await auth(session)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const guildId = await getGuildId(session)
  const project = await getDocProjectById(id)
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file')
  if (!file || typeof file === 'string') return Response.json({ error: 'No file' }, { status: 400 })

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  if (!allowed.includes(file.type)) return Response.json({ error: 'ไฟล์ต้องเป็นรูปภาพ (JPG/PNG)' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  try {
    const filePath = await cropAndSave(buffer, project.id)
    const attachment = await createAttachment(project.id, guildId, {
      originalName: file.name,
      filePath,
    })
    return Response.json(attachment, { status: 201 })
  } catch (err) {
    console.error('[POST attachments]', err)
    return Response.json({ error: 'Upload failed' }, { status: 500 })
  }
}
