import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import pool from '@/db/index.js'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { rows } = await pool.query(
    `SELECT DISTINCT om.guild_id, g.name
     FROM org_members om
     JOIN users u ON u.id = om.user_id
     LEFT JOIN (
       SELECT guild_id, MAX(value #>> '{}') AS name
       FROM dc_guild_config WHERE "key" = 'guild_name'
       GROUP BY guild_id
     ) g ON g.guild_id = om.guild_id
     WHERE u.discord_id = $1`,
    [session.user.discordId]
  )

  return Response.json(rows.map(r => ({ guild_id: r.guild_id, name: r.name || r.guild_id })))
}
