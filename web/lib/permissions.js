/**
 * Permission → capabilities (feature matrix) — universal, ไม่ขึ้นกับ guild (SPEC §5, §9)
 *
 * ⚠️ ที่นี่เช็คแค่ "permission" — "scope (∩ จังหวัด) ไม่อยู่ที่นี่"
 *    finance/calling นับ scope คนละแบบ (SPEC §7) → access function เป็นคนนับเอง ด้วย expandGrants()
 *
 * super_admin เป็น platform-level (env DEV_DISCORD_IDS ผ่าน lib/roles.js isSuperAdmin)
 * ไม่อยู่ในตารางนี้
 */

// canonical permission vocabulary (ป้าย B ใน dc_guild_roles.permission)
export const PERMISSIONS = [
  'admin',                  // god-mode/technical — เห็นทุกอย่างรวม private ของคนอื่น
  'secretary_general',      // เลขาธิการ — หัวหน้าองค์กรสูงสุด คุมงานได้หมด แต่ดู private คนอื่นไม่ได้ (≠admin)
  'regional_coordinator',   // ผู้ประสานงานภาค / รองเลขาธิการ
  'province_coordinator',   // ผู้ประสานงานจังหวัด
  'district_coordinator',   // กรรมการจังหวัด (ตทอ.) — แยก token ไว้ปรับลดสิทธิ์ทีหลัง; ปัจจุบันสิทธิ์เท่า province_coordinator
  'treasurer',              // เหรัญญิก
  'editor',                 // ทีมบรรณาธิการ / บรรณาธิการ
  'moderator',              // action-only — ลบ log ได้ แต่ดูข้อมูลไม่ได้
  'caseworker',             // ทีมเรื่องร้องเรียน — บริหารเคสในจังหวัด scope ของตัวเอง
  'member',                 // อยู่ guild แต่ไม่มี role พิเศษ
]

/**
 * capability → permission ที่ผ่าน (ยังไม่รวม scope)
 * ที่มา: SPEC §9 feature matrix
 */
export const CAPABILITIES = {
  // ── Finance ──
  viewPrivateOther:    ['admin'],                                                              // private ของคนอื่น = admin เท่านั้น
  viewInternal:        ['admin', 'secretary_general', 'regional_coordinator', 'province_coordinator', 'district_coordinator', 'treasurer'],
  editProvinceAccount: ['admin', 'secretary_general', 'province_coordinator', 'district_coordinator', 'treasurer'],
  editWide:            ['admin', 'secretary_general', 'treasurer'],
  createNonPrivate:    ['admin', 'secretary_general', 'regional_coordinator', 'province_coordinator', 'district_coordinator', 'treasurer'],
  editGlobalCategory:  ['admin', 'secretary_general', 'moderator'],   // เดิม GLOBAL_EDITORS

  // ── Calling ──
  viewCalling:         ['admin', 'secretary_general', 'regional_coordinator', 'province_coordinator', 'district_coordinator'],
  createCampaign:      ['admin', 'secretary_general', 'regional_coordinator', 'province_coordinator', 'district_coordinator'],
  seeContacts:         ['admin', 'secretary_general', 'regional_coordinator', 'province_coordinator', 'district_coordinator'], // เบอร์/LINE (PDPA)
  manageContacts:      ['admin', 'secretary_general', 'regional_coordinator', 'province_coordinator', 'district_coordinator'], // เดิม MANAGE_ROLES
  sendBulkSms:         ['admin', 'secretary_general', 'regional_coordinator', 'province_coordinator'],                          // เดิม SMS_ROLES
  overrideTier:        ['admin', 'secretary_general', 'treasurer'],
  deleteLog:           ['admin', 'secretary_general', 'moderator'],   // เดิม MODERATOR_ROLES (moderation gate)

  // ── Case (เรื่องร้องเรียน) ──
  manageCases:         ['admin', 'secretary_general', 'regional_coordinator', 'province_coordinator', 'district_coordinator', 'caseworker'],

  // ── Bot / Social ──
  manageSocial:        ['admin'],
  manageGuildConfig:   ['admin'],
  manageBasket:        ['admin', 'secretary_general', 'editor'],   // ตะกร้าสื่อ — ทีมสื่อ + admin

  // ── Admin ──
  viewServerLogs:      ['admin', 'moderator'],   // เดิม ['Admin','Moderator']
  manageRoles:         ['admin', 'moderator'],   // ตั้ง/ถอด Discord role ผ่านเว็บ (ตาม Manage Roles ใน Discord)
}

/**
 * เช็ค capability ด้วย permission อย่างเดียว (ไม่รวม scope)
 * @param {string} capability  key ใน CAPABILITIES
 * @param {Set<string>|string[]} permissions
 * @returns {boolean}
 */
export function can(capability, permissions) {
  const allowed = CAPABILITIES[capability]
  if (!allowed) throw new Error(`can: unknown capability '${capability}'`)
  const has = Array.isArray(permissions) ? (p => permissions.includes(p)) : (p => permissions.has(p))
  return allowed.some(has)
}

/**
 * capabilities ทั้งหมดที่ permission ตัวนี้ปลดล็อก (inverse ของ CAPABILITIES)
 * @param {string} permission
 * @returns {string[]}
 */
export function capabilitiesOf(permission) {
  return Object.keys(CAPABILITIES).filter(cap => CAPABILITIES[cap].includes(permission))
}

/**
 * FLOOR การแต่งตั้ง (capability-subset) — "แต่งตั้งไม่เกินอำนาจตัวเอง"
 * ผู้แต่งตั้ง (มี permissions หลายตัว) แต่งตั้ง role ที่ให้ `targetPermission` ได้ก็ต่อเมื่อ
 * ทุก capability ของ targetPermission ⊆ capability รวมของผู้แต่งตั้ง
 *   - `admin` แต่งตั้งผ่านเว็บไม่ได้เด็ดขาด (ได้ทางเดียว = เป็น owner ของ org)
 *   - ผู้มี `admin` (รวม owner ที่ได้ admin) แต่งตั้ง non-admin role ได้ทุกตัว
 * @param {Set<string>|string[]} appointerPerms  สิทธิ์ของผู้แต่งตั้ง
 * @param {string} targetPermission  permission ที่ role เป้าหมายให้
 * @returns {boolean}
 */
export function canAppoint(appointerPerms, targetPermission) {
  if (targetPermission === 'admin') return false
  const has = Array.isArray(appointerPerms) ? (p => appointerPerms.includes(p)) : (p => appointerPerms.has(p))
  if (has('admin')) return true
  const mine = new Set()
  for (const cap of Object.keys(CAPABILITIES)) {
    if (CAPABILITIES[cap].some(has)) mine.add(cap)
  }
  return capabilitiesOf(targetPermission).every(c => mine.has(c))
}
