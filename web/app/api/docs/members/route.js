import { getServerSession } from 'next-auth'
import pool from '@/db/index.js'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { getGuildId } from '@/lib/guildContext.js'

/**
 * GET /api/docs/members?q=&limit=20
 * Search users + org_members for docs entry assignment
 *
 * org_members มี 1 แถวต่อ 1 guild ที่ user เป็นสมาชิก — คนเดียวที่อยู่หลาย guild ของ org เดียวกัน
 * จะมีหลายแถว ชื่อเล่นอาจต่างกันต่อ guild → dedupe เหลือ 1 แถวต่อคน เลือกชื่อจาก guild ที่ user active อยู่ก่อน
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const q     = searchParams.get('q') || ''
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100)
  const orgId = await getOrgId(session)
  const activeGuildId = await getGuildId(session)

  const params = [orgId]
  let where = `om.org_id = $1`

  if (q) {
    params.push(`%${q}%`)
    where += ` AND (om.display_name ILIKE $${params.length} OR u.username ILIKE $${params.length} OR n.first_name ILIKE $${params.length} OR n.last_name ILIKE $${params.length})`
  }

  params.push(activeGuildId)
  const activeGuildParam = params.length
  params.push(limit)
  const limitParam = params.length

  const query = `
    SELECT * FROM (
      SELECT DISTINCT ON (u.id)
             u.id AS user_id, u.discord_id, om.display_name, u.username, om.member_id,
             n.first_name, n.last_name
      FROM org_members om
      JOIN users u ON u.id = om.user_id
      LEFT JOIN cache_pple_member n ON n.source_id = om.member_id
      WHERE ${where}
      ORDER BY u.id, (om.guild_id = $${activeGuildParam}) DESC NULLS LAST, om.joined_at DESC NULLS LAST
    ) people
    ORDER BY display_name
    LIMIT $${limitParam}`

  try {
    const { rows } = await pool.query(query, params)
    return Response.json({ success: true, data: rows })
  } catch (err) {
    console.error('[GET /api/docs/members]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
