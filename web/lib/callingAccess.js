/**
 * Calling System Access Control
 *
 * รับ access = { permissions: Set<string>, scopeGrants: string[] } จาก resolveAccess (SPEC กอง B)
 * — เก็บ logic เดิม (single-province + primaryProvince) แค่กิน permission/scope แทนชื่อ role (SPEC §2, §7)
 *
 * ⚠️ scope ต่างจาก finance (SPEC §7): regional → expand แค่ "ภาคย่อย" (ไม่รู้จักภาคใหญ่) ·
 *    province-level → จังหวัดเดียว (primaryProvince) ไม่ expand
 */

import { can } from './permissions.js'
import { expandGrants } from './geography.js'
import { normalizeAccess } from './roleAccess.js'

/** Admin / เลขาธิการ — เห็นทุกจังหวัด */
export function isAdmin(access = {}) {
  const p = normalizeAccess(access).permissions || new Set()
  return p.has('admin') || p.has('secretary_general')
}

/** ผู้ประสานงานภาค / รองเลขาธิการ */
export function isRegionalCoordinator(access = {}) {
  return (normalizeAccess(access).permissions || new Set()).has('regional_coordinator')
}

/** ผู้ประสานงานจังหวัด / กรรมการจังหวัด (ตทอ.) */
export function isProvincialCoordinator(access = {}) {
  const p = normalizeAccess(access).permissions || new Set()
  return p.has('province_coordinator') || p.has('district_coordinator')
}

/**
 * Get user's scope (provinces they can access)
 * Returns: ['ราชบุรี', ...] หรือ null ถ้า admin (ทุกจังหวัด)
 */
export function getUserScope(access = {}, primaryProvince = null) {
  const { permissions = new Set(), scopeGrants = [] } = normalizeAccess(access)

  // Admin → all provinces
  if (isAdmin(access)) return null

  // Regional → expand เฉพาะภาคย่อย (calling ไม่รู้จักภาคใหญ่)
  if (permissions.has('regional_coordinator')) {
    const subGrants = scopeGrants.filter(g => g.startsWith('subregion:'))
    const provinces = expandGrants(subGrants, { mode: 'calling' })
    return provinces.size > 0 ? Array.from(provinces) : []
  }

  // ทีมจังหวัด → จังหวัดเดียว
  const teamProvinces = scopeGrants
    .filter(g => g.startsWith('province:'))
    .map(g => g.slice('province:'.length))
  if (teamProvinces.length === 0) return []

  // Use primaryProvince เฉพาะถ้าเป็นจังหวัดของ user จริง (กัน debug/view-as-role)
  if (primaryProvince && teamProvinces.includes(primaryProvince)) return [primaryProvince]

  // Fallback: จังหวัดแรก
  return [teamProvinces[0]]
}

/**
 * Check if user can view member in province
 * If assigned already → always allow (bypass scope)
 */
export function canAccessMember(memberProvince, access = {}, isAssigned = false) {
  if (isAssigned) return true
  if (isAdmin(access)) return true

  const scope = getUserScope(access)
  if (scope === null) return true   // admin
  if (scope.length === 0) return false
  return scope.includes(memberProvince)
}

/** see phone/LINE (PDPA) — provincial level ขึ้นไป */
export function canSeeContacts(access = {}) {
  return can('seeContacts', normalizeAccess(access).permissions || new Set())
}

/** create campaign — provincial level ขึ้นไป */
export function canCreateCampaign(access = {}) {
  return can('createCampaign', normalizeAccess(access).permissions || new Set())
}

/** override tier — admin / เลขาธิการ / เหรัญญิก */
export function canOverrideTier(access = {}) {
  return can('overrideTier', normalizeAccess(access).permissions || new Set())
}
