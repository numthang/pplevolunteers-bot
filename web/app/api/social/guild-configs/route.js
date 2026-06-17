import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { canManageSocialGuild, isSuperAdmin } from '@/lib/roles.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getSocialManagerGuildIds } from '@/db/guilds.js'
import { getGuildId } from '@/lib/guildContext.js'
import pool from '@/db/index.js'

const ALLOWED_KEYS = ['meta_app_id', 'meta_app_secret', 'x_consumer_key', 'x_consumer_secret']

// GET → manager: { guildId, guildName, meta_app_id?, ... } / member: { guildId, hasMeta, hasX }
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { access, discordId: effDiscordId } = await getEffectiveIdentity(session)
  const canManage  = canManageSocialGuild(access)
  const superAdmin = isSuperAdmin(effDiscordId)              // gate = effective (debug-aware)

  const guildId = await getGuildId(session)

  // regular member — return boolean flags only (ไม่เปิดเผย credentials)
  if (!canManage && !superAdmin) {
    const { rows } = await pool.query(
      `SELECT "key" FROM dc_guild_config WHERE guild_id = $1 AND "key" = ANY($2)`,
      [guildId, ALLOWED_KEYS]
    )
    const keys = new Set(rows.map(r => r.key))
    return Response.json({
      guildId,
      hasMeta: keys.has('meta_app_id') && keys.has('meta_app_secret'),
      hasX:    keys.has('x_consumer_key') && keys.has('x_consumer_secret'),
    })
  }

  if (!superAdmin) {
    const managerGuildIds = await getSocialManagerGuildIds(effDiscordId)
    if (!managerGuildIds.includes(guildId)) return Response.json({ guildId, guildName: null })
  }

  const [cfgRes, guildRes] = await Promise.all([
    pool.query(
      `SELECT "key", value FROM dc_guild_config WHERE guild_id = $1 AND "key" = ANY($2)`,
      [guildId, ALLOWED_KEYS]
    ),
    pool.query(`SELECT name FROM dc_guilds WHERE guild_id = $1`, [guildId]),
  ])

  const cfg = { guildId, guildName: guildRes.rows[0]?.name ?? null }
  for (const r of cfgRes.rows) cfg[r.key] = r.value
  return Response.json(cfg)
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { access, discordId: effDiscordId } = await getEffectiveIdentity(session)
  const canManage = canManageSocialGuild(access)
  const superAdmin = isSuperAdmin(effDiscordId)              // gate = effective (debug-aware)
  if (!canManage && !superAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { guild_id, key, value } = body

  if (!guild_id || !key) return Response.json({ error: 'guild_id, key required' }, { status: 400 })
  if (!ALLOWED_KEYS.includes(key)) return Response.json({ error: 'invalid key' }, { status: 400 })

  if (!superAdmin) {
    const adminGuildIds = await getSocialManagerGuildIds(effDiscordId)
    if (!adminGuildIds.includes(guild_id)) return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (value === null || value === '') {
    await pool.query(
      `DELETE FROM dc_guild_config WHERE guild_id = $1 AND "key" = $2`,
      [guild_id, key]
    )
  } else {
    await pool.query(
      `INSERT INTO dc_guild_config (guild_id, "key", value) VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, "key") DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [guild_id, key, JSON.stringify(value)]
    )
  }

  return Response.json({ ok: true })
}
