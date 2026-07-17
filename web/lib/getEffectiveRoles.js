import { cookies } from 'next/headers'
import { isAdmin } from './roles.js'
import { DEBUG_COMBOS } from './debugCombos.js'
import { resolveAccess } from './resolveAccess.js'
import { getGuildId } from './guildContext.js'
import pool from '@/db/index.js'

const DEBUG_LABELS = DEBUG_COMBOS.map(c => c.label)

export async function getEffectiveRoles(session) {
  const { roles } = await getEffectiveIdentity(session)
  return roles
}

/**
 * คืน { roles, discordId, access } — roles/discordId คือ identity (debug-aware)
 * access = { isMember, permissions: Set, scopeGrants: [] } resolve จาก dc_guild_roles (DB จริง)
 */
export async function getEffectiveIdentity(session) {
  const guildId = await getGuildId(session)
  const { roles, webRoles, discordId, userId } = await resolveIdentity(session, guildId)
  const access = await resolveAccess(guildId, roles, webRoles)
  return { roles, discordId, userId, access }
}

/** อ่าน roles จริง (DB-fresh, bypass JWT cache) — ไม่ผ่าน debug/view-as-role */
async function getRealRoles(session, guildId) {
  const realDiscordId = session?.user?.discordId || null
  let realRoles = session?.user?.roles || []
  let realWebRoles = []
  if (realDiscordId) {
    try {
      const { rows } = await pool.query(
        `SELECT om.roles, om.web_roles FROM org_members om
           JOIN users u ON u.id = om.user_id
          WHERE om.guild_id = $1 AND u.discord_id = $2`,
        [guildId, realDiscordId]
      )
      if (rows[0]?.roles) {
        realRoles = rows[0].roles.split(',').map(r => r.trim()).filter(Boolean)
      }
      if (rows[0]?.web_roles) {
        realWebRoles = rows[0].web_roles.split(',').map(r => r.trim()).filter(Boolean)
      }
    } catch {}
  }
  return { realRoles, realWebRoles, realDiscordId, realUserId: session?.user?.userId || null }
}

/**
 * access จริง (ไม่ผ่าน debug) — ใช้กับ gate ที่ต้องเช็คตัวตนจริง เช่น "ใครเปิด view-as-role ได้"
 * (getEffectiveIdentity คืน access ของ role ที่ถูก impersonate ซึ่งผิดสำหรับ gate พวกนี้)
 */
export async function getRealAccess(session) {
  const guildId = await getGuildId(session)
  const { realRoles, realWebRoles } = await getRealRoles(session, guildId)
  return resolveAccess(guildId, realRoles, realWebRoles)
}

/** identity layer เดิม (อ่าน roles จาก DB + จัดการ debug/view-as-role) — แยกออกเพื่อ resolve access ครั้งเดียว */
async function resolveIdentity(session, guildId) {
  const { realRoles, realWebRoles, realDiscordId, realUserId } = await getRealRoles(session, guildId)

  // เฉพาะ admin จริงเท่านั้นที่ debug/view-as-role ได้ — เช็คด้วย real access (ไม่ใช่ effective)
  const realAccess = await resolveAccess(guildId, realRoles, realWebRoles)
  if (!isAdmin(realAccess)) return { roles: realRoles, webRoles: realWebRoles, discordId: realDiscordId, userId: realUserId }

  const cookieStore = await cookies()

  // Mode 1: impersonate specific member — ใช้ roles + web_roles จริงจาก DB
  const debugDiscordId = cookieStore.get('debug_discord_id')?.value
  if (debugDiscordId) {
    try {
      const { rows } = await pool.query(
        `SELECT om.roles, om.web_roles FROM org_members om
           JOIN users u ON u.id = om.user_id
          WHERE om.guild_id = $1 AND u.discord_id = $2`,
        [guildId, debugDiscordId]
      )
      const roles = rows[0]?.roles ? rows[0].roles.split(',').map(r => r.trim()).filter(Boolean) : []
      const webRoles = rows[0]?.web_roles ? rows[0].web_roles.split(',').map(r => r.trim()).filter(Boolean) : []
      return { roles, webRoles, discordId: null, userId: null }
    } catch {
      return { roles: realRoles, webRoles: realWebRoles, discordId: realDiscordId, userId: realUserId }
    }
  }

  // Mode 2: predefined combo (ยศ Discord ล้วน — ไม่มี web_roles)
  const debugLabel = cookieStore.get('debug_role')?.value
  if (!debugLabel || !DEBUG_LABELS.includes(debugLabel)) return { roles: realRoles, webRoles: realWebRoles, discordId: realDiscordId, userId: realUserId }

  const combo = DEBUG_COMBOS.find(c => c.label === debugLabel)
  if (!combo) return { roles: realRoles, webRoles: realWebRoles, discordId: realDiscordId, userId: realUserId }

  return { roles: combo.roles, webRoles: [], discordId: null, userId: null }
}
