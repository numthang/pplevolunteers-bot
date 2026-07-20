import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { canManageDocs, getUserScope } from '@/lib/docsAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { createDocProject, getDocEvents } from '@/db/docs/projects.js'
import { getAllowedItems } from '@/config/fund69-rules.js'

/**
 * GET /api/docs/projects?active=true
 * คืนโครงการที่ตั้งค่าแล้ว (มี docs_project) ตาม scope — ใช้ feed dropdown ใน nav
 * ไม่ต้อง canManageDocs — ใครมี province grant ก็เห็น dropdown ได้ (เหมือน calling)
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)

  const { searchParams } = new URL(req.url)
  const onlyActive = searchParams.get('active') === 'true'
  const orgId = await getOrgId(session)
  const scope = getUserScope(access)

  try {
    const all = await getDocEvents(orgId, scope)
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 60)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const data = all
      .filter(p => p.id)  // เฉพาะที่ตั้งค่าแล้ว (มี docs_project)
      .filter(p => !onlyActive || !p.event_date || p.event_date >= cutoffStr)
      .map(p => ({
        act_event_cache_id: p.act_event_cache_id,
        event_name:         p.event_name,
        status:             p.status,
      }))

    return Response.json({ success: true, data })
  } catch (err) {
    console.error('[GET /api/docs/projects]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * POST /api/docs/projects
 * Create a new docs project (legacy — setup page now uses POST /api/docs/entries instead)
 */
export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const { actEventCacheId, isMobile, participantCount, budget, projectName } = body

    if (!actEventCacheId) return Response.json({ error: 'actEventCacheId is required' }, { status: 400 })

    const orgId = await getOrgId(session)
    const id = await createDocProject({
      orgId,
      actEventCacheId,
      isMobile:         isMobile ?? false,
      participantCount: participantCount || null,
      budget:           budget || null,
      allowedItems:     getAllowedItems(isMobile ?? false),
      projectName:      projectName || null,
      createdBy:        session.user.userId,
    })

    return Response.json({ success: true, data: { id } }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/docs/projects]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
