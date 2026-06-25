import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { regenerateToken, getDocProjectById } from '@/db/docs/projects.js'

/**
 * POST /api/docs/projects/[id]/tokens
 * Body: { type: 'pdf' | 'export' }
 * สร้าง token ใหม่ + ตั้ง expiry 6 เดือน
 */
export async function POST(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { access } = await getEffectiveIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { type } = await req.json()
  if (type !== 'pdf' && type !== 'export') return Response.json({ error: 'type must be pdf or export' }, { status: 400 })

  const project = await getDocProjectById(id)
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const result = await regenerateToken(id, type)
  return Response.json(result)
}

/** GET /api/docs/projects/[id]/tokens — ดู token ปัจจุบัน */
export async function GET(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { access } = await getEffectiveIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const project = await getDocProjectById(id)
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json({
    export_token:         project.export_token,
    export_token_expires: project.export_token_expires,
    pdf_token:            project.pdf_token,
    pdf_token_expires:    project.pdf_token_expires,
  })
}
