import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isAdmin } from '@/lib/roles.js'
import { getRealAccess } from '@/lib/getEffectiveRoles.js'
import { getGuildId } from '@/lib/guildContext.js'
import pool from '@/db/index.js'

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin(await getRealAccess(session))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const q = new URL(req.url).searchParams.get('q')?.trim()
  if (!q || q.length < 2) return Response.json([])

  const guildId = await getGuildId(session)
  const { rows } = await pool.query(
    `SELECT u.discord_id, u.username, om.display_name, om.nickname, om.province, om.roles
     FROM org_members om
     JOIN users u ON u.id = om.user_id
     WHERE om.guild_id = $1 AND (u.username ILIKE $2 OR om.display_name ILIKE $2 OR om.nickname ILIKE $2)
     ORDER BY om.display_name, u.username
     LIMIT 10`,
    [guildId, `%${q}%`]
  )

  return Response.json(rows.map(r => ({
    discordId: r.discord_id,
    displayName: r.display_name || r.username,
    username: r.username,
    nickname: r.nickname,
    province: r.province,
    roles: r.roles,
  })))
}
