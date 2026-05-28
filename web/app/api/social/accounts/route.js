import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isAdmin } from '@/lib/roles.js'
import pool from '@/db/index.js'

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const guildId = searchParams.get('guild_id')
  const admin   = isAdmin(session.user.roles)

  const SELECT = `SELECT id, user_discord_id, guild_id, name, group_name, platform, social_id,
                         access_token IS NOT NULL AS has_access_token,
                         user_token IS NOT NULL AS has_user_token,
                         user_token_expires_at, visibility, created_at
                  FROM dc_social_accounts`

  let rows
  if (admin) {
    if (guildId) {
      const r = await pool.query(`${SELECT} WHERE guild_id = $1`, [guildId])
      rows = r.rows
    } else {
      const r = await pool.query(`${SELECT} ORDER BY guild_id, platform, id`)
      rows = r.rows
    }
  } else {
    if (guildId) {
      const r = await pool.query(`${SELECT} WHERE user_discord_id = $1 AND guild_id = $2 ORDER BY platform, id`,
        [session.user.discordId, guildId])
      rows = r.rows
    } else {
      const r = await pool.query(`${SELECT} WHERE user_discord_id = $1 ORDER BY platform, id`,
        [session.user.discordId])
      rows = r.rows
    }
  }

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

  await pool.query(
    `INSERT INTO dc_social_accounts (user_discord_id, guild_id, name, platform, social_id, access_token, user_token, visibility)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_key, guild_id, platform, social_id) DO UPDATE SET
       name = EXCLUDED.name, access_token = EXCLUDED.access_token,
       user_token = EXCLUDED.user_token, visibility = EXCLUDED.visibility`,
    [session.user.discordId, guild_id, name || platform, platform, social_id, access_token || null, user_token || null, visibility]
  )

  return Response.json({ ok: true })
}
