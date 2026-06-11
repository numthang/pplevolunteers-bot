/**
 * Test fixture — แปลงชื่อ role (guild อาสาประชาชน) → access object
 *
 * นี่คือ policy mirror เดิมของ seed-guild-roles.js ที่ย้ายมาเป็น "test-only" หลังลบออกจาก production
 * (runtime ใช้ DB จริงผ่าน resolveAccess แล้ว) — test ใช้ตัวนี้แปลง array ชื่อ role ในเคสเดิม
 * ให้เป็น access object เพื่อพิสูจน์ว่า branching ของ financeAccess/callingAccess ยังถูก
 */
import { SUB_REGION_MAP, MAIN_REGION_MAP } from '../geography.js'

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

const PROVINCES        = new Set(Object.keys(SUB_REGION_MAP))
const SUBREGION_ROLES  = new Set(Object.values(SUB_REGION_MAP))
const MAINREGION_ROLES = new Set(Object.values(MAIN_REGION_MAP))

/** roleNames[] → { permissions: Set, scopeGrants: [] } */
export function rolesToAccess(roleNames = []) {
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
