import { cookies } from 'next/headers'
import { isAdmin } from './roles.js'
import { DEBUG_COMBOS } from './debugCombos.js'
import { resolveAccessV2, accessFromRoleNames } from './resolveAccessV2.js'
import { getGuildId } from './guildContext.js'
import { getOrgId } from './orgContext.js'
import pool from '@/db/index.js'

const DEBUG_LABELS = DEBUG_COMBOS.map(c => c.label)

export async function getEffectiveRoles(session) {
  const { roles } = await getEffectiveIdentity(session)
  return roles
}

/**
 * คืน { roles, discordId, access } — roles/discordId คือ identity (debug-aware)
 * access = { isMember, permissions: Set, scopeGrants: [] } จาก org_member_roles (ORG_ACCESS_REDESIGN ขั้น 4)
 *
 * `roles` (ชื่อยศ Discord) ยังคืนไว้เพื่อ "แสดงผล" — ไม่ใช้ตัดสินสิทธิ์อีกแล้ว
 *
 * 2 ทางที่ต้องแยก:
 *   - ปกติ / impersonate คนจริง → resolveAccessV2(orgId, userId) = อ่านของจริง
 *   - view-as-role (combo สมมติ) → accessFromRoleNames() เพราะไม่มี user จริงให้อ่าน
 *     (ทั้งคู่วิ่งผ่าน reduceRoleDefs ตัวเดียวกัน → preview ตรงกับของจริงเสมอ)
 */
export async function getEffectiveIdentity(session) {
  const guildId = await getGuildId(session)
  const orgId = await getOrgId(session)
  const { roles, discordId, userId, comboRoles } = await resolveIdentity(session, guildId)

  const access = comboRoles
    ? await accessFromRoleNames(orgId, comboRoles)
    : await resolveAccessV2(orgId, userId)

  return { roles, discordId, userId, access }
}

/** อ่าน roles จริง (DB-fresh, bypass JWT cache) — ไม่ผ่าน debug/view-as-role */
async function getRealRoles(session, guildId) {
  const realDiscordId = session?.user?.discordId || null
  let realRoles = session?.user?.roles || []
  if (realDiscordId) {
    try {
      const { rows } = await pool.query(
        `SELECT om.roles FROM org_members om
           JOIN users u ON u.id = om.user_id
          WHERE om.guild_id = $1 AND u.discord_id = $2`,
        [guildId, realDiscordId]
      )
      if (rows[0]?.roles) {
        realRoles = rows[0].roles.split(',').map(r => r.trim()).filter(Boolean)
      }
    } catch {}
  }
  return { realRoles, realDiscordId, realUserId: session?.user?.userId || null }
}

/**
 * access จริง (ไม่ผ่าน debug) — ใช้กับ gate ที่ต้องเช็คตัวตนจริง เช่น "ใครเปิด view-as-role ได้"
 * (getEffectiveIdentity คืน access ของ role ที่ถูก impersonate ซึ่งผิดสำหรับ gate พวกนี้)
 */
export async function getRealAccess(session) {
  return resolveAccessV2(await getOrgId(session), session?.user?.userId || null)
}

/**
 * identity layer (อ่าน roles จาก DB + จัดการ debug/view-as-role)
 * คืน `comboRoles` เมื่ออยู่โหมด view-as-role → caller ต้องคำนวณ access จากชื่อยศสมมติแทน user จริง
 */
async function resolveIdentity(session, guildId) {
  const { realRoles, realDiscordId, realUserId } = await getRealRoles(session, guildId)
  const real = { roles: realRoles, discordId: realDiscordId, userId: realUserId, comboRoles: null }

  // เฉพาะ admin จริงเท่านั้นที่ debug/view-as-role ได้ — เช็คด้วย real access (ไม่ใช่ effective)
  const realAccess = await resolveAccessV2(await getOrgId(session), realUserId)
  if (!isAdmin(realAccess)) return real

  const cookieStore = await cookies()

  // Mode 1: impersonate คนจริง — อ่านสิทธิ์จริงของคนนั้นด้วย userId ของเขา
  const debugDiscordId = cookieStore.get('debug_discord_id')?.value
  if (debugDiscordId) {
    try {
      const { rows } = await pool.query(
        `SELECT u.id AS user_id, om.roles FROM org_members om
           JOIN users u ON u.id = om.user_id
          WHERE om.guild_id = $1 AND u.discord_id = $2`,
        [guildId, debugDiscordId]
      )
      if (!rows[0]) return real
      const roles = rows[0].roles ? rows[0].roles.split(',').map(r => r.trim()).filter(Boolean) : []
      // discordId = null กัน ownership bypass ตอน debug · userId = ของคนที่ถูกสวมรอย (ใช้อ่านสิทธิ์)
      return { roles, discordId: null, userId: rows[0].user_id, comboRoles: null }
    } catch {
      return real
    }
  }

  // Mode 2: combo สมมติ — ไม่มี user จริง ต้องคำนวณจากชื่อยศ
  const debugLabel = cookieStore.get('debug_role')?.value
  if (!debugLabel || !DEBUG_LABELS.includes(debugLabel)) return real

  const combo = DEBUG_COMBOS.find(c => c.label === debugLabel)
  if (!combo) return real

  return { roles: combo.roles, discordId: null, userId: null, comboRoles: combo.roles }
}
