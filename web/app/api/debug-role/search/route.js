import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isAdmin } from '@/lib/roles.js'
import pool from '@/db/index.js'

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin(session.user.roles)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const q = new URL(req.url).searchParams.get('q')?.trim()
  if (!q || q.length < 2) return Response.json([])

  const [rows] = await pool.query(
    `SELECT discord_id, username, display_name, nickname, province, roles
     FROM dc_members
     WHERE guild_id = ? AND (username LIKE ? OR display_name LIKE ? OR nickname LIKE ?)
     ORDER BY display_name, username
     LIMIT 10`,
    [process.env.GUILD_ID, `%${q}%`, `%${q}%`, `%${q}%`]
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
