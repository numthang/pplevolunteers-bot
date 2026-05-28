import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isAdmin } from '@/lib/roles.js'
import pool from '@/db/index.js'

const ALLOWED_KEYS = ['meta_app_id', 'meta_app_secret', 'x_consumer_key', 'x_consumer_secret']

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin(session.user.roles)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { rows } = await pool.query(
    `SELECT guild_id, "key", value FROM dc_guild_config WHERE "key" = ANY($1)`,
    [ALLOWED_KEYS]
  )

  const configs = {}
  for (const r of rows) {
    if (!configs[r.guild_id]) configs[r.guild_id] = {}
    configs[r.guild_id][r.key] = r.value
  }
  return Response.json(configs)
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin(session.user.roles)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { guild_id, key, value } = body

  if (!guild_id || !key) return Response.json({ error: 'guild_id, key required' }, { status: 400 })
  if (!ALLOWED_KEYS.includes(key)) return Response.json({ error: 'invalid key' }, { status: 400 })

  if (value === null || value === '') {
    await pool.query(
      `DELETE FROM dc_guild_config WHERE guild_id = $1 AND "key" = $2`,
      [guild_id, key]
    )
  } else {
    await pool.query(
      `INSERT INTO dc_guild_config (guild_id, "key", value) VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, "key") DO UPDATE SET value = EXCLUDED.value`,
      [guild_id, key, value]
    )
  }

  return Response.json({ ok: true })
}
