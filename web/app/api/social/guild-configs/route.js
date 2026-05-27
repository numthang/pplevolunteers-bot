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

  const [rows] = await pool.execute(
    `SELECT guild_id, \`key\`, value FROM dc_guild_config WHERE \`key\` IN (?, ?, ?, ?)`,
    ALLOWED_KEYS
  )

  // group by guild_id → { [guild_id]: { meta_app_id, meta_app_secret, x_consumer_key, x_consumer_secret } }
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
    await pool.execute(
      'DELETE FROM dc_guild_config WHERE guild_id = ? AND `key` = ?',
      [guild_id, key]
    )
  } else {
    await pool.execute(
      'INSERT INTO dc_guild_config (guild_id, `key`, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
      [guild_id, key, value]
    )
  }

  return Response.json({ ok: true })
}
