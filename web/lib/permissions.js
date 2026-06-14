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

  // ── Bot / Social ──
  manageSocial:        ['admin'],
  manageGuildConfig:   ['admin'],

  // ── Admin ──
  viewServerLogs:      ['admin', 'moderator'],   // เดิม ['Admin','Moderator']
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
