import { getServerSession } from 'next-auth'
import pool from '@/db/index.js'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { canManageDocs, getUserScope } from '@/lib/docsAccess.js'
import { getOrgId } from '@/lib/orgContext.js'

/**
 * GET /api/docs/events?q=&province=&limit=20
 * Search cache_pple_event for docs project creation
 * cache_pple_event ยังเป็น guild-based (ไม่ได้ migrate) — scope ด้วย org bridge
 * เหมือน getDocEvents (db/docs/projects.js) เพื่อครอบทุก guild ของ org นี้
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const q        = searchParams.get('q') || ''
  const province = searchParams.get('province') || ''
  const limit    = Math.min(parseInt(searchParams.get('limit') || '30'), 100)
  const orgId    = await getOrgId(session)
  const scope    = getUserScope(access)

  const params = [orgId]
  let query = `
    SELECT id, name, province,
      TO_CHAR(event_date,     'YYYY-MM-DD"T"HH24:MI') AS event_date,
      TO_CHAR(event_end_date, 'YYYY-MM-DD"T"HH24:MI') AS event_end_date,
      image_url
    FROM cache_pple_event
    WHERE guild_id IN (SELECT guild_id FROM dc_guilds WHERE org_id = $1)
      AND type = 'event'`

  if (q) {
    params.push(`%${q}%`)
    query += ` AND name ILIKE $${params.length}`
  }

  if (province) {
    params.push(province)
    query += ` AND province = $${params.length}`
  } else if (scope !== null && scope.length > 0) {
    params.push(scope)
    query += ` AND (province = ANY($${params.length}) OR province IS NULL)`
  }

  params.push(limit)
  query += ` ORDER BY event_date DESC NULLS LAST LIMIT $${params.length}`

  try {
    const { rows } = await pool.query(query, params)
    return Response.json({ success: true, data: rows })
  } catch (err) {
    console.error('[GET /api/docs/events]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
