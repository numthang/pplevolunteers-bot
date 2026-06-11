/**
 * roleAccess — normalize access object ให้รูปแบบเดียว
 *
 * source ของ access คือ DB (dc_guild_roles ผ่าน resolveAccess) — server ได้ Set ตรงๆ,
 * client ได้ผ่าน /api/me/access ที่ permissions เป็น array (Set ข้าม JSON ไม่ได้)
 * ฟังก์ชันนี้แปลงทั้งสองรูปให้เป็น { permissions: Set, scopeGrants: [] } เสมอ
 *
 * (เดิมมี mirror hardcode roleToAccess/PERMISSION_BY_ROLE สำหรับ guild อาสาประชาชน —
 *  ลบแล้วหลัง consumer ทุกตัวรับ access object จาก DB · policy per-guild อยู่ใน dc_guild_roles)
 */

/**
 * รับ access object → คืน { permissions: Set, scopeGrants: [] } เสมอ
 * - object จาก resolveAccess (server) → permissions เป็น Set อยู่แล้ว ปล่อยผ่าน
 * - object จาก JSON wire (API)        → permissions เป็น array → แปลงกลับเป็น Set
 */
export function normalizeAccess(access) {
  if (!access) return { permissions: new Set(), scopeGrants: [] }
  const permissions = access.permissions instanceof Set
    ? access.permissions
    : new Set(access.permissions || [])
  return { permissions, scopeGrants: access.scopeGrants || [] }
}
