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
import { expandGrants } from './geography.js'
import { normalizeAccess } from './roleAccess.js'

// "หัวหน้าองค์กร" ที่ทำได้ทุกอย่างระดับ edit/internal (= isAdmin เดิม: Admin || เลขาธิการ)
function isOrgHead(permissions) {
  return permissions.has('admin') || permissions.has('secretary_general')
}

// จังหวัดจาก grant แบบ province: ดิบ (ไม่ expand ภาค) — ใช้กับ province-level (exact)
function exactProvinces(scopeGrants) {
  const s = new Set()
  for (const g of scopeGrants) if (g.startsWith('province:')) s.add(g.slice('province:'.length))
  return s
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
    // ผู้ประสานงานภาค / รองเลขาธิการ → scope ภาค/ภาคย่อย/จังหวัด (expand 3 ชั้น)
    if (permissions.has('regional_coordinator')) {
      return expandGrants(scopeGrants, { mode: 'finance' }).has(account.province)
    }
    // เหรัญญิก / กรรมการจังหวัด / ผู้ประสานงานจังหวัด → ต้องมีทีมจังหวัดตรงๆ เท่านั้น
    if (permissions.has('treasurer') || permissions.has('province_coordinator') || permissions.has('district_coordinator')) {
      return exactProvinces(scopeGrants).has(account.province)
    }
    return false
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
    return hasTitle && exactProvinces(scopeGrants).has(account.province)
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
