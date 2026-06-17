// Permission-based role helpers — รับ access object (จาก resolveAccess / /api/me/access)
// ไม่เช็คชื่อ Discord role ตรงๆ อีกต่อไป → guild ที่ตั้งชื่อ role ต่างกันก็ทำงานถูก
import { normalizeAccess } from '@/lib/roleAccess.js'

// platform-level — env DEV_DISCORD_IDS (ไม่ขึ้นกับ guild/role)
export function isSuperAdmin(discordId) {
  const ids = (process.env.DEV_DISCORD_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
  return ids.includes(String(discordId))
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
