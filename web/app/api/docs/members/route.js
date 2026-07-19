import { getServerSession } from 'next-auth'
import pool from '@/db/index.js'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getGuildId } from '@/lib/guildContext.js'

/**
 * GET /api/docs/members?q=&limit=20
 * Search users + org_members for docs entry assignment
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const q       = searchParams.get('q') || ''
  const limit   = Math.min(parseInt(searchParams.get('limit') || '30'), 100)
  const guildId = await getGuildId(session)

  const params = [guildId]
  let query = `
    SELECT u.discord_id, om.display_name, u.username, om.member_id,
           n.first_name, n.last_name
    FROM org_members om
    JOIN users u ON u.id = om.user_id
    LEFT JOIN cache_pple_member n ON n.source_id = om.member_id
    WHERE om.guild_id = $1`

  if (q) {
    params.push(`%${q}%`)
    query += ` AND (om.display_name ILIKE $${params.length} OR u.username ILIKE $${params.length} OR n.first_name ILIKE $${params.length} OR n.last_name ILIKE $${params.length})`
  }

  params.push(limit)
  query += ` ORDER BY om.display_name LIMIT $${params.length}`

  try {
    const { rows } = await pool.query(query, params)
    return Response.json({ success: true, data: rows })
  } catch (err) {
    console.error('[GET /api/docs/members]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
