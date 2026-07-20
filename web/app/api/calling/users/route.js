import { getServerSession } from 'next-auth'
import pool from '@/db/index.js'
import { authOptions } from '@/lib/auth-options.js'
import { getOrgId } from '@/lib/orgContext.js'

/**
 * GET /api/calling/users
 * Return org_members (+ users identity) for the guild (for assignee combobox)
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = await getOrgId(session)
  if (!orgId) {
    return Response.json({ error: 'GUILD_ID not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const all = searchParams.get('all') === 'true'

  try {
    const { rows } = await pool.query(
      `SELECT u.discord_id,
              COALESCE(NULLIF(om.display_name, ''), u.username) AS display_name,
              om.province
       FROM org_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.guild_id = $1
         AND ($2 = '' OR om.display_name ILIKE $3 OR u.username ILIKE $3)
       ORDER BY display_name ASC
       ${all ? '' : 'LIMIT 50'}`,
      [orgId, q, `%${q}%`]
    )
    return Response.json({ success: true, data: rows })
  } catch (error) {
    console.error('[GET /api/calling/users]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
