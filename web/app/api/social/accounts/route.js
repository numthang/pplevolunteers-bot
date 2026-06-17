import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { canManageSocialGuild, isSuperAdmin } from '@/lib/roles.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getSocialManagerGuildIds } from '@/db/guilds.js'
import { getGuildId } from '@/lib/guildContext.js'
import pool from '@/db/index.js'

const SELECT = `SELECT id, user_discord_id, guild_id, name, group_name, platform, social_id,
                       access_token IS NOT NULL AS has_access_token,
                       user_token IS NOT NULL AS has_user_token,
                       user_token_expires_at, visibility, created_at
                FROM dc_social_accounts`

// GET → public accounts ของ guild ปัจจุบัน (cookie) + private accounts ของ user ทุก guild
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { access, discordId: effDiscordId } = await getEffectiveIdentity(session)
  const canManage  = canManageSocialGuild(access)
  const superAdmin = isSuperAdmin(effDiscordId)               // gate = effective (debug-aware)
  const discordId  = session.user.discordId                   // private accounts = ของจริงเสมอ
  const guildId    = await getGuildId(session)

  let publicRows = []
  let privateRows = []

  if (superAdmin || canManage) {
    if (!superAdmin) {
      const managerGuildIds = await getSocialManagerGuildIds(effDiscordId)
      if (!managerGuildIds.includes(guildId)) {
        // canManage แต่ไม่ใช่ manager ของ guild นี้ — เห็นแค่ private ของตัวเอง
        const r = await pool.query(
          `${SELECT} WHERE user_discord_id = $1 AND visibility = 'private' ORDER BY platform, id`,
          [discordId]
        )
        return Response.json(r.rows)
      }
    }
    const [pub, priv] = await Promise.all([
      pool.query(`${SELECT} WHERE guild_id = $1 AND visibility = 'public' ORDER BY platform, id`, [guildId]),
      pool.query(`${SELECT} WHERE user_discord_id = $1 AND visibility = 'private' ORDER BY platform, id`, [discordId]),
    ])
    publicRows  = pub.rows
    privateRows = priv.rows
  } else {
    // regular user: เห็นแค่ private ของตัวเอง
    const r = await pool.query(
      `${SELECT} WHERE user_discord_id = $1 AND visibility = 'private' ORDER BY platform, id`,
      [discordId]
    )
    privateRows = r.rows
  }

  return Response.json([...publicRows, ...privateRows])
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { access, discordId: effDiscordId } = await getEffectiveIdentity(session)
  const canManage  = canManageSocialGuild(access)
  const superAdmin = isSuperAdmin(effDiscordId)               // gate = effective (debug-aware)

  const body = await req.json()
  const { guild_id, name, platform, social_id, access_token, user_token } = body
  let { visibility = 'public' } = body

  if (!guild_id || !platform || !social_id) {
    return Response.json({ error: 'guild_id, platform, social_id required' }, { status: 400 })
  }

  // non-manager → force private, ห้ามสร้าง public account
  if (!superAdmin && !canManage) {
    visibility = 'private'
  }

  // ถ้าจะสร้าง public ต้องเป็น manager ของ guild นั้น
  if (visibility === 'public' && !superAdmin) {
    const managerGuildIds = await getSocialManagerGuildIds(effDiscordId)
    if (!managerGuildIds.includes(guild_id)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
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
