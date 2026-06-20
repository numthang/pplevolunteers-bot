/**
 * Docs System Access Control
 *
 * รับ access = { permissions: Set<string>, scopeGrants: string[] } จาก resolveAccess
 *
 * scope rules (ตาม DOCS.md):
 *   admin / secretary_general  → ทุกจังหวัด
 *   regional_coordinator       → expand subregion (เหมือน calling)
 *   province_coordinator / district_coordinator → จังหวัดที่ติดยศ (เหมือน calling)
 *   treasurer                  → exactProvinces เท่านั้น (เหมือน finance)
 */

import { expandGrants } from './geography.js'
import { normalizeAccess } from './roleAccess.js'

const MANAGE_PERMISSIONS = new Set([
  'admin', 'secretary_general', 'regional_coordinator',
  'province_coordinator', 'district_coordinator', 'treasurer',
])

function isOrgHead(permissions) {
  return permissions.has('admin') || permissions.has('secretary_general')
}

function exactProvinces(scopeGrants) {
  const s = new Set()
  for (const g of scopeGrants) if (g.startsWith('province:')) s.add(g.slice('province:'.length))
  return s
}

/** ใครจัดการเอกสารได้ (สร้าง/แก้/export) */
export function canManageDocs(access = {}) {
  const p = normalizeAccess(access).permissions || new Set()
  return [...MANAGE_PERMISSIONS].some(r => p.has(r))
}

/**
 * Get user's scope (provinces they can access)
 * Returns: ['ราชบุรี', ...] หรือ null ถ้า admin (ทุกจังหวัด)
 */
export function getUserScope(access = {}) {
  const { permissions = new Set(), scopeGrants = [] } = normalizeAccess(access)

  if (isOrgHead(permissions)) return null

  // regional → expand subregion (เหมือน calling)
  if (permissions.has('regional_coordinator')) {
    const subGrants = scopeGrants.filter(g => g.startsWith('subregion:'))
    const provinces = expandGrants(subGrants, { mode: 'calling' })
    return provinces.size > 0 ? Array.from(provinces) : []
  }

  // treasurer → exactProvinces (เหมือน finance)
  if (permissions.has('treasurer')) {
    return Array.from(exactProvinces(scopeGrants))
  }

  // province_coordinator / district_coordinator → จังหวัดที่ติดยศ
  return scopeGrants
    .filter(g => g.startsWith('province:'))
    .map(g => g.slice('province:'.length))
}

/**
 * ตรวจว่า user เห็น event นี้ได้ไหม (ตาม province ของ event)
 * province = null หมายถึงระดับประเทศ → ทุกคนที่ canManageDocs เห็นได้
 */
export function canAccessEvent(eventProvince, access = {}) {
  if (!canManageDocs(access)) return false
  if (!eventProvince) return true

  const scope = getUserScope(access)
  if (scope === null) return true
  return scope.includes(eventProvince)
}
