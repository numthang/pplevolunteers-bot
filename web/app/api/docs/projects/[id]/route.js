import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { updateDocProject, getDocProjectByEventId } from '@/db/docs/projects.js'
import { getAllowedItems } from '@/config/fund69-rules.js'

/** GET /api/docs/projects/[id] — id = act_event_cache_id */
export async function GET(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const orgId = await getOrgId(session)
  const project = await getDocProjectByEventId(id, orgId)
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ success: true, data: project })
}

/** PATCH /api/docs/projects/[id] — id = act_event_cache_id */
export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const orgId = await getOrgId(session)
    const project = await getDocProjectByEventId(id, orgId)
    if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const { isMobile, participantCount, budget, status, projectName } = body
    const update = { isMobile, participantCount, budget, status, projectName }
    if (isMobile !== undefined) update.allowedItems = getAllowedItems(isMobile)

    await updateDocProject(project.id, update)
    const updated = await getDocProjectByEventId(id, orgId)
    return Response.json({ success: true, data: updated })
  } catch (err) {
    console.error('[PATCH /api/docs/projects/:id]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
