import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getAttachmentById } from '@/db/docs/attachments.js'
import { readFile, getUploadPath } from '@/lib/cropDocument.js'
import path from 'path'

/** GET /api/docs/projects/[id]/attachments/[attId]/image */
export async function GET(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return new Response('Unauthorized', { status: 401 })
  const { access } = await getEffectiveIdentity(session)
  if (!canManageDocs(access)) return new Response('Forbidden', { status: 403 })

  const { id, attId } = await params
  const att = await getAttachmentById(attId, id)
  if (!att) return new Response('Not found', { status: 404 })

  try {
    const filePath = path.join(getUploadPath(), att.file_path)
    const buf = await readFile(filePath)
    return new Response(buf, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return new Response('File not found', { status: 404 })
  }
}
