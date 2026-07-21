import { getServerSession } from 'next-auth'
import pool from '@/db/index.js'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getOrgId } from '@/lib/orgContext.js'

/**
 * GET /api/docs/members/recent?province=X&limit=8
 * ผู้รับเงินล่าสุดในจังหวัดนั้น (distinct per member, เรียง entry id ล่าสุดก่อน)
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const province = searchParams.get('province') || ''
  const limit    = Math.min(parseInt(searchParams.get('limit') || '8'), 20)
  const orgId    = await getOrgId(session)

  try {
    const { rows } = await pool.query(
      `SELECT user_id, discord_id, display_name, username, member_id, first_name, last_name
       FROM (
         SELECT DISTINCT ON (e.member_user_id)
                u.id AS user_id, u.discord_id, m.display_name, u.username, m.member_id,
                n.first_name, n.last_name,
                e.id AS last_entry_id
         FROM docs_activity_entries e
         JOIN docs_projects dp ON dp.id = e.project_id AND dp.org_id = $1
         JOIN cache_pple_event ev ON ev.id = dp.cache_pple_event_id
         JOIN users u ON u.id = e.member_user_id
         JOIN org_members m ON m.user_id = u.id AND m.org_id = $1
         LEFT JOIN cache_pple_member n ON n.source_id = m.member_id
         WHERE e.member_user_id IS NOT NULL
           AND ($2 = '' OR ev.province = $2)
         ORDER BY e.member_user_id, e.id DESC
       ) sub
       ORDER BY last_entry_id DESC
       LIMIT $3`,
      [orgId, province, limit]
    )
    return Response.json({ success: true, data: rows })
  } catch (err) {
    console.error('[GET /api/docs/members/recent]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
