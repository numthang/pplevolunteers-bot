import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import pool from '@/db/index.js'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { rows } = await pool.query(
    `SELECT DISTINCT m.guild_id, g.name
     FROM dc_members m
     LEFT JOIN (
       SELECT guild_id, MAX(value #>> '{}') AS name
       FROM dc_guild_config WHERE "key" = 'guild_name'
       GROUP BY guild_id
     ) g ON g.guild_id = m.guild_id
     WHERE m.discord_id = $1`,
    [session.user.discordId]
  )

  return Response.json(rows.map(r => ({ guild_id: r.guild_id, name: r.name || r.guild_id })))
}
