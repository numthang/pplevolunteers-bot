import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { regenerateToken, getDocProjectById } from '@/db/docs/projects.js'

/**
 * POST /api/docs/projects/[id]/tokens
 * สร้าง project_token ใหม่ + ตั้ง expiry 6 เดือน (token เดียวใช้ทั้ง receipt/registration)
 */
export async function POST(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { access } = await getEffectiveIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const project = await getDocProjectById(id)
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const result = await regenerateToken(id)
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

  // auto-create token if missing
  let { project_token, project_token_expires } = project
  if (!project_token) { const r = await regenerateToken(id); project_token = r.token; project_token_expires = r.expires }

  return Response.json({ project_token, project_token_expires })
}
