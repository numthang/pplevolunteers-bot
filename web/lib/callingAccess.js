/**
 * Calling System Access Control
 * Based on role hierarchy and scope
 */

import { getOrganizationInfo } from '@/db/calling/members.js'

// Role hierarchy levels
const ADMIN_ROLES = ['Admin', 'เลขาธิการ']
const REGIONAL_ROLES = ['ผู้ประสานงานภาค', 'รองเลขาธิการ']
const PROVINCIAL_ROLES = ['ผู้ประสานงานจังหวัด', 'กรรมการจังหวัด']

// Map discord role name to province
const PROVINCE_ROLE_MAP = {
  'ทีมกรุงเทพชั้นใน': 'กรุงเทพชั้นใน',
  'ทีมกรุงเทพธนบุรี': 'กรุงเทพธนบุรี',
  'ทีมกรุงเทพตะวันออก': 'กรุงเทพตะวันออก',
  'ทีมกรุงเทพเหนือ': 'กรุงเทพเหนือ',
  'ทีมนนทบุรี': 'นนทบุรี',
  'ทีมสมุทรปราการ': 'สมุทรปราการ',
  'ทีมสมุทรสาคร': 'สมุทรสาคร',
  'ทีมปทุมธานี': 'ปทุมธานี',
  'ทีมราชบุรี': 'ราชบุรี',
  'ทีมนครปฐม': 'นครปฐม',
  'ทีมกาญจนบุรี': 'กาญจนบุรี',
  'ทีมเพชรบุรี': 'เพชรบุรี',
  'ทีมสุพรรณบุรี': 'สุพรรณบุรี',
  'ทีมสมุทรสงคราม': 'สมุทรสงคราม',
  'ทีมประจวบคีรีขันธ์': 'ประจวบคีรีขันธ์',
  'ทีมอุทัยธานี': 'อุทัยธานี',
  'ทีมอ่างทอง': 'อ่างทอง',
  'ทีมสระบุรี': 'สระบุรี',
  'ทีมอยุธยา': 'อยุธยา',
  'ทีมนครนายก': 'นครนายก',
  'ทีมลพบุรี': 'ลพบุรี',
  'ทีมชัยนาท': 'ชัยนาท',
  'ทีมสิงห์บุรี': 'สิงห์บุรี',
  'ทีมเชียงใหม่': 'เชียงใหม่',
  'ทีมเชียงราย': 'เชียงราย',
  'ทีมแม่ฮ่องสอน': 'แม่ฮ่องสอน',
  'ทีมลำพูน': 'ลำพูน',
  'ทีมลำปาง': 'ลำปาง',
  'ทีมแพร่': 'แพร่',
  'ทีมพะเยา': 'พะเยา',
  'ทีมน่าน': 'น่าน',
  'ทีมกำแพงเพชร': 'กำแพงเพชร',
  'ทีมตาก': 'ตาก',
  'ทีมนครสวรรค์': 'นครสวรรค์',
  'ทีมพิจิตร': 'พิจิตร',
  'ทีมพิษณุโลก': 'พิษณุโลก',
  'ทีมเพชรบูรณ์': 'เพชรบูรณ์',
  'ทีมสุโขทัย': 'สุโขทัย',
  'ทีมอุตรดิตถ์': 'อุตรดิตถ์',
  'ทีมตราด': 'ตราด',
  'ทีมจันทบุรี': 'จันทบุรี',
  'ทีมระยอง': 'ระยอง',
  'ทีมชลบุรี': 'ชลบุรี',
  'ทีมฉะเชิงเทรา': 'ฉะเชิงเทรา',
  'ทีมปราจีนบุรี': 'ปราจีนบุรี',
  'ทีมสระแก้ว': 'สระแก้ว',
  'ทีมอุดรธานี': 'อุดรธานี',
  'ทีมหนองคาย': 'หนองคาย',
  'ทีมบึงกาฬ': 'บึงกาฬ',
  'ทีมสกลนคร': 'สกลนคร',
  'ทีมมุกดาหาร': 'มุกดาหาร',
  'ทีมนครพนม': 'นครพนม',
  'ทีมอำนาจเจริญ': 'อำนาจเจริญ',
  'ทีมเลย': 'เลย',
  'ทีมชัยภูมิ': 'ชัยภูมิ',
  'ทีมขอนแก่น': 'ขอนแก่น',
  'ทีมกาฬสินธุ์': 'กาฬสินธุ์',
  'ทีมยโสธร': 'ยโสธร',
  'ทีมหนองบัวลำภู': 'หนองบัวลำภู',
  'ทีมมหาสารคาม': 'มหาสารคาม',
  'ทีมร้อยเอ็ด': 'ร้อยเอ็ด',
  'ทีมอุบลราชธานี': 'อุบลราชธานี',
  'ทีมศรีสะเกษ': 'ศรีสะเกษ',
  'ทีมสุรินทร์': 'สุรินทร์',
  'ทีมบุรีรัมย์': 'บุรีรัมย์',
  'ทีมนครราชสีมา': 'นครราชสีมา',
  'ทีมชุมพร': 'ชุมพร',
  'ทีมพังงา': 'พังงา',
  'ทีมระนอง': 'ระนอง',
  'ทีมภูเก็ต': 'ภูเก็ต',
  'ทีมสุราษฎร์ธานี': 'สุราษฎร์ธานี',
  'ทีมนครศรีธรรมราช': 'นครศรีธรรมราช',
  'ทีมตรัง': 'ตรัง',
  'ทีมกระบี่': 'กระบี่',
  'ทีมสงขลา': 'สงขลา',
  'ทีมพัทลุง': 'พัทลุง',
  'ทีมสตูล': 'สตูล',
  'ทีม 3 จังหวัด': 'ปัตตานี', // default
}

// Map region role to provinces
const REGION_PROVINCES = {
  'ทีมกรุงเทพ': ['กรุงเทพชั้นใน', 'กรุงเทพธนบุรี', 'กรุงเทพตะวันออก', 'กรุงเทพเหนือ'],
  'ทีมปริมณฑล': ['นนทบุรี', 'สมุทรปราการ', 'สมุทรสาคร', 'ปทุมธานี'],
  'ทีมภาคกลางตะวันตก': ['ราชบุรี', 'นครปฐม', 'กาญจนบุรี', 'เพชรบุรี', 'สุพรรณบุรี', 'สมุทรสงคราม', 'ประจวบคีรีขันธ์'],
  'ทีมภาคกลางตะวันออก': ['อุทัยธานี', 'อ่างทอง', 'สระบุรี', 'อยุธยา', 'นครนายก', 'ลพบุรี', 'ชัยนาท', 'สิงห์บุรี'],
  'ทีมภาคเหนือตอนบน': ['เชียงใหม่', 'เชียงราย', 'แม่ฮ่องสอน', 'ลำพูน', 'ลำปาง', 'แพร่', 'พะเยา', 'น่าน'],
  'ทีมภาคเหนือตอนล่าง': ['กำแพงเพชร', 'ตาก', 'นครสวรรค์', 'พิจิตร', 'พิษณุโลก', 'เพชรบูรณ์', 'สุโขทัย', 'อุตรดิตถ์'],
  'ทีมภาคตะวันออก': ['ตราด', 'จันทบุรี', 'ระยอง', 'ชลบุรี', 'ฉะเชิงเทรา', 'ปราจีนบุรี', 'สระแก้ว'],
  'ทีมภาคอีสานเหนือ': ['อุดรธานี', 'หนองคาย', 'บึงกาฬ', 'สกลนคร', 'มุกดาหาร', 'นครพนม', 'อำนาจเจริญ'],
  'ทีมภาคอีสานกลาง': ['เลย', 'ชัยภูมิ', 'ขอนแก่น', 'กาฬสินธุ์', 'ยโสธร', 'หนองบัวลำภู', 'มหาสารคาม', 'ร้อยเอ็ด'],
  'ทีมภาคอีสานใต้': ['อุบลราชธานี', 'ศรีสะเกษ', 'สุรินทร์', 'บุรีรัมย์', 'นครราชสีมา'],
  'ทีมภาคใต้ตอนบน': ['ชุมพร', 'พังงา', 'ระนอง', 'ภูเก็ต', 'สุราษฎร์ธานี', 'นครศรีธรรมราช'],
  'ทีมภาคใต้ตอนล่าง': ['ตรัง', 'กระบี่', 'สงขลา', 'พัทลุง', 'สตูล', 'ปัตตานี', 'ยะลา', 'นราธิวาส'],
}

/**
 * Check if user is admin
 */
export function isAdmin(roles = []) {
  return roles.some(r => ADMIN_ROLES.includes(r))
}

/**
 * Check if user is regional coordinator
 */
export function isRegionalCoordinator(roles = []) {
  return roles.some(r => REGIONAL_ROLES.includes(r))
}

/**
 * Check if user is provincial coordinator
 */
export function isProvincialCoordinator(roles = []) {
  return roles.some(r => PROVINCIAL_ROLES.includes(r))
}

/**
 * Get user's scope (provinces they can access)
 * Returns: ['ราชบุรี', 'นครปฐม', ...] or null if admin (all provinces)
 */
export function getUserScope(roles = []) {
  // Admin → all provinces
  if (isAdmin(roles)) return null

  const provinces = new Set()

  // Regional coordinator + ทีมภาค → add region's provinces
  if (isRegionalCoordinator(roles)) {
    for (const role of roles) {
      if (REGION_PROVINCES[role]) {
        REGION_PROVINCES[role].forEach(p => provinces.add(p))
      }
    }
  }

  // Provincial coordinator + ทีมXXX → add that province
  if (isProvincialCoordinator(roles)) {
    for (const role of roles) {
      const province = PROVINCE_ROLE_MAP[role]
      if (province) provinces.add(province)
    }
  }

  return provinces.size > 0 ? Array.from(provinces) : []
}

/**
 * Check if user can view member in province
 * If assigned already → always allow (bypass scope)
 */
export function canAccessMember(memberProvince, roles = [], isAssigned = false) {
  // Assigned → always allow
  if (isAssigned) return true

  // Admin → always allow
  if (isAdmin(roles)) return true

  // Check scope
  const scope = getUserScope(roles)
  if (scope === null) return true // admin
  if (scope.length === 0) return false // no scope

  return scope.includes(memberProvince)
}

/**
 * Check if user can create campaign
 * Provincial level and above
 */
export function canCreateCampaign(roles = []) {
  return isAdmin(roles) || isRegionalCoordinator(roles) || isProvincialCoordinator(roles)
}

/**
 * Check if user can override tier
 * (Only admin or เหรัญญิก can override)
 */
export function canOverrideTier(roles = []) {
  return isAdmin(roles) || roles.includes('เหรัญญิก')
}
