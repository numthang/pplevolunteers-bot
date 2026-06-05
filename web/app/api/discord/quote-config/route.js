import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isAdmin, isSuperAdmin } from '@/lib/roles.js'
import { getAdminGuildIds, getGuilds } from '@/db/guilds.js'
import { QUOTE_STYLE_KEYS } from '@/lib/quoteStyles.js'
import pool from '@/db/index.js'

// quote_default_template = เฉพาะ quote, default_watermark = ค่ากลางใช้ร่วมทุก feature
const KEYS = ['quote_default_template', 'default_watermark']
const GLOBAL_GUILD_ID = 'global'

// value validators ต่อ key
function isValidValue(key, value) {
  if (value === null) return true // ลบค่า
  if (key === 'quote_default_template') return QUOTE_STYLE_KEYS.includes(value)
  if (key === 'default_watermark') return /^(personal|guild):.+/.test(value)
  return false
}

// อ่าน config จาก dc_user_config (personal) / dc_guild_config (guild, global)
async function readUser(discordId) {
  const { rows } = await pool.query(
    `SELECT "key", value FROM dc_user_config WHERE discord_id = $1 AND "key" = ANY($2)`,
    [discordId, KEYS]
  )
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}
async function readGuild(guildIds) {
  if (!guildIds.length) return {}
  const { rows } = await pool.query(
    `SELECT guild_id, "key", value FROM dc_guild_config WHERE "key" = ANY($1) AND guild_id = ANY($2)`,
    [KEYS, guildIds]
  )
  const out = {}
  for (const r of rows) {
    if (!out[r.guild_id]) out[r.guild_id] = {}
    out[r.guild_id][r.key] = r.value
  }
  return out
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const discordId  = session.user.discordId
  const superAdmin = isSuperAdmin(discordId)

  // superadmin เห็นทุก guild, admin เห็นเฉพาะ guild ที่ตัวเองมี role Admin
  const allGuilds = await getGuilds()
  const nameById  = Object.fromEntries(allGuilds.map(g => [g.guild_id, g.name]))
  const adminGuildIds = superAdmin
    ? allGuilds.map(g => g.guild_id)
    : isAdmin(session.user.roles)
      ? await getAdminGuildIds(discordId)
      : []

  const guildCfg = await readGuild(adminGuildIds)
  const personal = await readUser(discordId)

  const guilds = adminGuildIds.map(id => ({
    guild_id: id,
    name: nameById[id] || id,
    config: guildCfg[id] || {},
  }))

  const res = { personal, guilds, isSuperAdmin: superAdmin }
  if (superAdmin) {
    const g = await readGuild([GLOBAL_GUILD_ID])
    res.global = g[GLOBAL_GUILD_ID] || {}
  }
  return Response.json(res)
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const discordId  = session.user.discordId
  const superAdmin = isSuperAdmin(discordId)

  const body = await req.json()
  const { scope, guild_id, key } = body
  let { value } = body
  if (value === '' || value === undefined) value = null

  if (!KEYS.includes(key)) return Response.json({ error: 'invalid key' }, { status: 400 })
  if (!isValidValue(key, value)) return Response.json({ error: 'invalid value' }, { status: 400 })

  if (scope === 'personal') {
    return await upsertUser(discordId, key, value)
  }

  if (scope === 'guild') {
    if (!guild_id) return Response.json({ error: 'guild_id required' }, { status: 400 })
    const adminGuildIds = await getAdminGuildIds(discordId)
    if (!superAdmin && !adminGuildIds.includes(guild_id)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    return await upsertGuild(guild_id, key, value)
  }

  if (scope === 'global') {
    if (!superAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })
    return await upsertGuild(GLOBAL_GUILD_ID, key, value)
  }

  return Response.json({ error: 'invalid scope' }, { status: 400 })
}

async function upsertUser(discordId, key, value) {
  if (value === null) {
    await pool.query(`DELETE FROM dc_user_config WHERE discord_id = $1 AND "key" = $2`, [discordId, key])
  } else {
    await pool.query(
      `INSERT INTO dc_user_config (discord_id, "key", value) VALUES ($1, $2, $3)
       ON CONFLICT (discord_id, "key") DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [discordId, key, JSON.stringify(value)]
    )
  }
  return Response.json({ ok: true })
}

async function upsertGuild(guildId, key, value) {
  if (value === null) {
    await pool.query(`DELETE FROM dc_guild_config WHERE guild_id = $1 AND "key" = $2`, [guildId, key])
  } else {
    await pool.query(
      `INSERT INTO dc_guild_config (guild_id, "key", value) VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, "key") DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [guildId, key, JSON.stringify(value)]
    )
  }
  return Response.json({ ok: true })
}
