import { getServerSession } from 'next-auth'
import pool from '@/db/index.js'
import { authOptions } from '@/lib/auth-options.js'

/**
 * GET /api/calling/users
 * Return dc_members for the guild (for assignee combobox)
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const guildId = process.env.GUILD_ID
  if (!guildId) {
    return Response.json({ error: 'GUILD_ID not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const all = searchParams.get('all') === 'true'

  try {
    const [rows] = await pool.query(
      `SELECT discord_id,
              COALESCE(NULLIF(display_name, ''), username) AS display_name,
              province
       FROM dc_members
       WHERE guild_id = ?
         AND (? = '' OR display_name LIKE ? OR username LIKE ?)
       ORDER BY display_name ASC
       ${all ? '' : 'LIMIT 50'}`,
      [guildId, q, `%${q}%`, `%${q}%`]
    )
    return Response.json({ success: true, data: rows })
  } catch (error) {
    console.error('[GET /api/calling/users]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
