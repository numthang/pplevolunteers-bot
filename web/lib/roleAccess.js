/**
 * roleAccess — แปลงชื่อ role (อาสาประชาชน) → { permissions, scopeGrants }
 *
 * เป็น "policy mirror" ของ seed-guild-roles.js — ใช้เป็น runtime source ชั่วคราวสำหรับ guild อาสาประชาชน
 * (ทำงานได้ทั้ง server + client — client (useEffectiveRoles) แตะ DB ไม่ได้)
 *
 * 🔜 multi-guild: resolveAccess.js อ่าน dc_guild_roles จาก DB เป็น source จริง — boundary (getEffectiveIdentity)
 *    จะส่ง access object เข้ามาแทน array แล้ว normalizeAccess จะปล่อยผ่าน (ไม่ต้องแก้ access function)
 */
import { SUB_REGION_MAP, MAIN_REGION_MAP } from './geography.js'

const PERMISSION_BY_ROLE = {
  'Admin':                'admin',
  'เลขาธิการ':            'secretary_general',
  'ผู้ประสานงานภาค':      'regional_coordinator',
  'รองเลขาธิการ':         'regional_coordinator',
  'ผู้ประสานงานจังหวัด':  'province_coordinator',
  'กรรมการจังหวัด':       'district_coordinator',
  'เหรัญญิก':             'treasurer',
  'ทีมบรรณาธิการ':        'editor',
  'Moderator':            'moderator',
}

const PROVINCES        = new Set(Object.keys(SUB_REGION_MAP))    // ชื่อจังหวัดทั้งหมด
const SUBREGION_ROLES  = new Set(Object.values(SUB_REGION_MAP))  // role ภาคย่อย
const MAINREGION_ROLES = new Set(Object.values(MAIN_REGION_MAP)) // role ภาคใหญ่

/** roleNames[] → { permissions: Set, scopeGrants: [] } (รูปแบบเดียวกับ resolveAccess) */
export function roleToAccess(roleNames = []) {
  const permissions = new Set()
  const scopeGrants = []
  for (const r of roleNames) {
    if (PERMISSION_BY_ROLE[r]) permissions.add(PERMISSION_BY_ROLE[r])
    if (r.startsWith('ทีม')) {
      const prov = r.replace(/^ทีม/, '')
      if (PROVINCES.has(prov))     { scopeGrants.push(`province:${prov}`); continue }
      if (SUBREGION_ROLES.has(r))  { scopeGrants.push(`subregion:${r}`);  continue }
      if (MAINREGION_ROLES.has(r)) { scopeGrants.push(`region:${r}`);     continue }
    }
  }
  return { permissions, scopeGrants }
}

/**
 * รับได้ทั้ง array(ชื่อ role) และ access object → คืน { permissions, scopeGrants } เสมอ
 * array → แปลงผ่าน mirror · object → ปล่อยผ่าน (มาจาก resolveAccess/DB)
 */
export function normalizeAccess(access) {
  if (Array.isArray(access)) return roleToAccess(access)
  return access || {}
}
