/**
 * Finance Access Control
 *
 * รับ access = { permissions: Set<string>, scopeGrants: string[] } จาก resolveAccess (SPEC กอง B)
 * — ไม่แตะ branching เดิม แค่เปลี่ยน leaf check จากชื่อ role → permission/scope (SPEC §2)
 *
 * ⚠️ "admin" 2 ความหมาย (อย่ารวม):
 *   - private ของคนอื่น → `admin` เท่านั้น (เลขาธิการเห็นไม่ได้)
 *   - edit / internal-view → `admin` หรือ `secretary_general` (เลขาธิการคุมงานได้)
 * ⚠️ scope 2 แบบ (SPEC §7): regional → expand 3 ชั้น (expandGrants) · province-level → จังหวัดตรงๆ เท่านั้น
 */

import { can } from './permissions.js'
import { normalizeAccess } from './roleAccess.js'

// "หัวหน้าองค์กร" ที่ทำได้ทุกอย่างระดับ edit/internal (= isAdmin เดิม: Admin || เลขาธิการ)
function isOrgHead(permissions) {
  return permissions.has('admin') || permissions.has('secretary_general')
}

// พื้นที่ที่เข้าถึงได้ — resolveAccessV2 ไล่ชั้นมาให้แล้ว (ORG_ACCESS_REDESIGN ขั้น 4)
// เดิมที่นี่ต้องแยกเอง: regional → expandGrants 3 ชั้น · province-level → exact
// ตอนนี้กติกาการไล่ชั้นอยู่ที่ reduceRoleDefs ที่เดียว (กั้นด้วยตำแหน่ง ไม่ใช่รูปร่างต้นไม้)
function scopeSet(scopeGrants) {
  return new Set(scopeGrants)
}

/**
 * ตรวจสิทธิ์ดูบัญชี
 */
export function canViewAccount(account, userId, access = {}) {
  const { permissions = new Set(), scopeGrants = [] } = normalizeAccess(access)
  const owner = account.owner_id === userId

  if (account.visibility === 'private') return owner || permissions.has('admin')
  if (account.visibility === 'public')  return true

  // internal
  if (owner || isOrgHead(permissions)) return true

  if (account.province) {
    // ตำแหน่งที่ดูบัญชีรายจังหวัดได้ — scope มาจาก resolveAccessV2 (ไล่ชั้นให้แล้วถ้ามีสิทธิ์)
    const canScoped = permissions.has('regional_coordinator') || permissions.has('treasurer')
      || permissions.has('province_coordinator') || permissions.has('district_coordinator')
    return canScoped && scopeSet(scopeGrants).has(account.province)
  } else {
    // province = null → คนในองค์กรทุก permission ที่กำหนดดูได้
    return can('viewInternal', permissions)
  }
}

/**
 * ตรวจสิทธิ์แก้ไข/ลบบัญชี
 */
export function canEditAccount(account, userId, access = {}) {
  const { permissions = new Set(), scopeGrants = [] } = normalizeAccess(access)
  const owner = account.owner_id === userId
  if (owner || isOrgHead(permissions)) return true

  if (account.province) {
    const hasTitle = permissions.has('treasurer') || permissions.has('province_coordinator') || permissions.has('district_coordinator')
    return hasTitle && scopeSet(scopeGrants).has(account.province)
  } else {
    // province = null → เหรัญญิกแก้ไขได้
    return permissions.has('treasurer')
  }
}

export function filterAccessibleAccounts(accounts, userId, access = {}) {
  return accounts.filter(a => canViewAccount(a, userId, access))
}

export function canCreateNonPrivateAccount(access = {}) {
  return can('createNonPrivate', normalizeAccess(access).permissions || new Set())
}
