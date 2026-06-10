/**
 * resolveAccess — แปลงชื่อ role (จาก dc_members.roles) → permissions + raw scope grants ต่อ guild
 *
 * อ่าน catalog จาก dc_guild_roles (ป้าย B: permission + scope_node) ด้วย index idx_dc_guild_roles_lookup
 * คืน grant "ดิบ" (ยังไม่ expand) — ปล่อยให้ finance/calling expand เองด้วย geography.expandGrants (SPEC §7, §8)
 *
 * - fail-safe: role ที่ไม่มีแถว (หรือ permission/scope = null) = ไม่มีสิทธิ์
 * - cache catalog ต่อ guild ใน memory (เปลี่ยนนานๆ ที) — เรียก clearAccessCache() เมื่อ sync ใหม่
 * - ผ่าน getEffectiveRoles/getEffectiveIdentity เดิม → debug/view-as-role ยังทำงาน (resolver กิน "ชื่อ role")
 */

import pool from '@/db/index.js'

const CACHE_TTL_MS = 5 * 60 * 1000
const _cache = new Map() // guildId → { at, byName: Map<role_name, Array<{permission, scope_node}>> }

/**
 * โหลด catalog ของ guild (cached) → Map<role_name, rows[]>
 * (role_name ซ้ำได้เพราะ Discord ตั้งชื่อ role ซ้ำได้ → เก็บเป็น array)
 */
async function loadGuildRoles(guildId) {
  const hit = _cache.get(guildId)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.byName

  const { rows } = await pool.query(
    `SELECT role_name, permission, scope_node FROM dc_guild_roles WHERE guild_id = $1`,
    [guildId]
  )
  const byName = new Map()
  for (const r of rows) {
    if (!byName.has(r.role_name)) byName.set(r.role_name, [])
    byName.get(r.role_name).push(r)
  }
  _cache.set(guildId, { at: Date.now(), byName })
  return byName
}

/** ล้าง cache (เรียกหลัง bot sync catalog ใหม่) — ไม่ส่ง guildId = ล้างทั้งหมด */
export function clearAccessCache(guildId) {
  if (guildId) _cache.delete(guildId)
  else _cache.clear()
}

/**
 * pure reducer — รวม rows ของ role ที่ user ถือ → { permissions, scopeGrants }
 * แยกออกมาเพื่อ test ได้โดยไม่แตะ DB
 * @param {Map<string, Array<{permission, scope_node}>>} byName
 * @param {string[]} roleNames
 */
export function reduceRoleRows(byName, roleNames = []) {
  const permissions = new Set()
  const scopeGrants = []
  for (const name of roleNames) {
    const rows = byName.get(name)
    if (!rows) continue
    for (const r of rows) {
      if (r.permission) permissions.add(r.permission)
      if (r.scope_node) scopeGrants.push(r.scope_node)
    }
  }
  return { permissions, scopeGrants }
}

/**
 * @param {string} guildId
 * @param {string[]} roleNames  ชื่อ role จาก dc_members.roles (null = ไม่ใช่สมาชิก guild นี้)
 * @returns {Promise<{ isMember: boolean, permissions: Set<string>, scopeGrants: string[] }>}
 *
 * membership gate: ถ้า caller (getEffectiveRoles) ไม่เจอแถวใน dc_members → ส่ง null/undefined มา → isMember=false
 * สมาชิกที่ไม่มี role พิเศษ ส่ง [] มา → isMember=true แต่ permissions ว่าง (fail-safe)
 */
export async function resolveAccess(guildId, roleNames) {
  const isMember = Array.isArray(roleNames)
  if (!isMember) return { isMember: false, permissions: new Set(), scopeGrants: [] }

  const byName = await loadGuildRoles(guildId)
  const { permissions, scopeGrants } = reduceRoleRows(byName, roleNames)
  return { isMember, permissions, scopeGrants }
}
