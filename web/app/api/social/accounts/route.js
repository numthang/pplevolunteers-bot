import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isAdmin } from '@/lib/roles.js'
import pool from '@/db/index.js'

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin(session.user.roles)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const guildId = searchParams.get('guild_id')

  const [rows] = await pool.execute(
    `SELECT id, user_discord_id, guild_id, name, platform, social_id,
            access_token IS NOT NULL AS has_access_token,
            user_token IS NOT NULL AS has_user_token,
            user_token_expires_at, visibility, created_at
     FROM dc_social_accounts
     ${guildId ? 'WHERE guild_id = ?' : 'ORDER BY guild_id, platform, id'}`,
    guildId ? [guildId] : []
  )

  return Response.json(rows)
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin(session.user.roles)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { guild_id, name, platform, social_id, access_token, user_token, visibility = 'public' } = body

  if (!guild_id || !platform || !social_id) {
    return Response.json({ error: 'guild_id, platform, social_id required' }, { status: 400 })
  }

  await pool.execute(
    `INSERT INTO dc_social_accounts (user_discord_id, guild_id, name, platform, social_id, access_token, user_token, visibility)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), access_token = VALUES(access_token),
       user_token = VALUES(user_token), visibility = VALUES(visibility)`,
    [session.user.discordId, guild_id, name || platform, platform, social_id, access_token || null, user_token || null, visibility]
  )

  return Response.json({ ok: true })
}
