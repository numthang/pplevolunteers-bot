// config ของหน้า /bot/platforms — 2 ชั้นในเส้นเดียว (2026-07-29):
//   app creds 4 คีย์  → org_config (ราย org) · org ที่ไม่มี Discord ต้องตั้งเองได้
//   news_channel_id   → dc_guild_config (Discord artifact = channel id คงราย guild)
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { canManageSocialGuild, isSuperAdmin } from '@/lib/roles.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getSocialManagerGuildIds } from '@/db/guilds.js'
import { getGuildId } from '@/lib/guildContext.js'
import { getOrgId } from '@/lib/orgContext.js'
import { getSocialAppCreds, SOCIAL_APP_KEYS } from '@/lib/socialAppCreds.js'
import { setOrgConfig, deleteOrgConfig } from '@/db/orgConfig.js'
import pool from '@/db/index.js'

const GUILD_KEYS   = ['news_channel_id']
const ALLOWED_KEYS = [...SOCIAL_APP_KEYS, ...GUILD_KEYS]

async function getGuildKeys(guildId) {
  if (!guildId) return {}
  const { rows } = await pool.query(
    `SELECT "key", value FROM dc_guild_config WHERE guild_id = $1 AND "key" = ANY($2)`,
    [guildId, GUILD_KEYS]
  )
  return Object.fromEntries(rows.filter(r => r.value).map(r => [r.key, r.value]))
}

// GET → manager: { guildId, guildName, meta_app_id?, ... } / member: { guildId, hasMeta, hasX }
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { access, discordId: effDiscordId } = await getEffectiveIdentity(session)
  const canManage  = canManageSocialGuild(access)
  const superAdmin = isSuperAdmin(effDiscordId)              // gate = effective (debug-aware)

  const guildId = await getGuildId(session)
  const orgId   = await getOrgId(session)

  // regular member — return boolean flags only (ไม่เปิดเผย credentials)
  if (!canManage && !superAdmin) {
    const creds = await getSocialAppCreds({ orgId, guildId })
    return Response.json({
      guildId,
      hasMeta:    !!(creds.meta_app_id && creds.meta_app_secret),
      hasThreads: !!(creds.threads_app_id && creds.threads_app_secret),
      hasX:       !!(creds.x_consumer_key && creds.x_consumer_secret),
    })
  }

  if (!superAdmin && guildId) {
    const managerGuildIds = await getSocialManagerGuildIds(effDiscordId)
    if (!managerGuildIds.includes(guildId)) return Response.json({ guildId, guildName: null })
  }

  const [creds, guildKeys, guildRes] = await Promise.all([
    getSocialAppCreds({ orgId, guildId }),
    getGuildKeys(guildId),
    guildId ? pool.query(`SELECT name FROM dc_guilds WHERE guild_id = $1`, [guildId]) : { rows: [] },
  ])

  return Response.json({
    guildId,
    guildName: guildRes.rows[0]?.name ?? null,
    ...creds,
    ...guildKeys,
  })
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

  if (!key) return Response.json({ error: 'key required' }, { status: 400 })
  if (!ALLOWED_KEYS.includes(key)) return Response.json({ error: 'invalid key' }, { status: 400 })

  // ส่ง guild_id มา (คีย์ราย guild / หน้าเว็บที่มี guild context) → ต้องเป็น manager ของ guild นั้นจริง
  if (guild_id && !superAdmin) {
    const adminGuildIds = await getSocialManagerGuildIds(effDiscordId)
    if (!adminGuildIds.includes(guild_id)) return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const isEmpty = value === null || value === ''

  // app creds → org ของ session (ไม่ใช่ guild) · ค่าเก็บเป็น text ดิบ ไม่ JSON.stringify
  if (SOCIAL_APP_KEYS.includes(key)) {
    const orgId = await getOrgId(session)
    if (!orgId) return Response.json({ error: 'ยังไม่มีองค์กรที่ใช้งานอยู่' }, { status: 400 })
    if (isEmpty) await deleteOrgConfig(orgId, key)
    else         await setOrgConfig(orgId, key, String(value))
    return Response.json({ ok: true })
  }

  // Discord artifact → ยังราย guild เหมือนเดิม (value = json)
  if (!guild_id) return Response.json({ error: 'guild_id required' }, { status: 400 })
  if (isEmpty) {
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
