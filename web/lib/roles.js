// roles มาจาก dc_members.roles เป็น array ของชื่อ role เช่น ['Admin', 'ทีมเชียงใหม่', 'เหรัญญิก']

export function isAdmin(roles = []) {
  return roles.includes('Admin')
}

export function isเหรัญญิก(roles = []) {
  return roles.includes('เหรัญญิก')
}

export function isRegionCoordinator(roles = []) {
  return roles.includes('ผู้ประสานงานภาค')
}

export function isProvinceCoordinator(roles = []) {
  return roles.includes('ผู้ประสานงานจังหวัด') || roles.includes('กรรมการจังหวัด')
}

export function canEditFinance(roles = []) {
  return isAdmin(roles) || isเหรัญญิก(roles)
}

export function canEditAccount(roles = [], account) {
  if (isAdmin(roles)) return true
  if (!isเหรัญญิก(roles)) return false
  if (account.visibility === 'private') return false
  return true
}

export function canViewAccount(roles = [], account, discordId) {
  if (account.visibility === 'public') return true
  if (account.owner_id === discordId) return true
  if (account.visibility === 'internal') {
    return isAdmin(roles) || isRegionCoordinator(roles) || isProvinceCoordinator(roles) || isเหรัญญิก(roles)
  }
  return false
}
