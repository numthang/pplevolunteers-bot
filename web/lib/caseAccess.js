/**
 * Case (เรื่องร้องเรียน) Access Control
 *
 * scope เหมือน calling เป๊ะ (single-province + ภาคย่อย expand) — reuse getUserScope/isAdmin
 * จาก callingAccess.js โดยตรง · เพิ่มแค่ canManageCases (permission gate ใหม่ `caseworker`)
 *
 * admin/secretary_general → เห็นทุกจังหวัด · caseworker/province/regional → ตาม scopeGrants
 */

import { can } from './permissions.js'
import { normalizeAccess } from './roleAccess.js'
import { getUserScope, isAdmin, isRegionalCoordinator, isProvincialCoordinator } from './callingAccess.js'

export { getUserScope, isAdmin, isRegionalCoordinator, isProvincialCoordinator }

/** บริหารเคสได้ไหม — caseworker + ผู้ประสานงาน + admin */
export function canManageCases(access = {}) {
  return can('manageCases', normalizeAccess(access).permissions || new Set())
}

/**
 * เคสจังหวัดนี้อยู่ใน scope ของ user ไหม
 * @param {string} caseProvince  จังหวัดของเคส
 * @param {object} access
 */
export function canAccessCaseProvince(caseProvince, access = {}) {
  const scope = getUserScope(access)
  if (scope === null) return true      // admin → ทุกจังหวัด
  if (scope.length === 0) return false
  return scope.includes(caseProvince)
}
