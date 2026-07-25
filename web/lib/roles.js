// Permission-based role helpers — รับ access object (จาก resolveAccess / /api/me/access)
// ไม่เช็คชื่อ Discord role ตรงๆ อีกต่อไป → guild ที่ตั้งชื่อ role ต่างกันก็ทำงานถูก
import { normalizeAccess } from '@/lib/roleAccess.js'

// platform-level — env DEV_DISCORD_IDS / DEV_USER_IDS (ไม่ขึ้นกับ guild/role)
// รองรับทั้ง 2 key: discord superadmin เดิมยังใช้ได้ (arg เดียว) · email-only superadmin
// ต้อง thread userId เข้ามาด้วย (คน login ไม่มี discord จะ match ได้ทาง DEV_USER_IDS)
export function isSuperAdmin(discordId, userId = null) {
  const parse = (v) => (v || '').split(',').map(s => s.trim()).filter(Boolean)
  const dcIds = parse(process.env.DEV_DISCORD_IDS)
  if (discordId != null && dcIds.includes(String(discordId))) return true
  const userIds = parse(process.env.DEV_USER_IDS)
  if (userId != null && userIds.includes(String(userId))) return true
  return false
}

// org-level admin = admin (god-mode/technical) || secretary_general (เลขาธิการ)
// ⚠️ ไม่รวม "เห็น private คนอื่น" — อันนั้นใช้ can('viewPrivateOther') = admin เท่านั้น
export function isAdmin(access = {}) {
  const p = normalizeAccess(access).permissions
  return p.has('admin') || p.has('secretary_general')
}

export function isEditor(access = {}) {
  const p = normalizeAccess(access).permissions
  return p.has('editor')
}

// social guild management — admin + coordinators
export function canManageSocialGuild(access = {}) {
  const p = normalizeAccess(access).permissions
  return p.has('admin') || p.has('secretary_general') || p.has('province_coordinator') || p.has('district_coordinator')
}
