/**
 * กฎกองทุนเพื่อการพัฒนาการเมือง ปี 2569
 * ใช้สำหรับ validate ceiling และ propose มื้ออาหารใน budget planner
 *
 * ⚠️ เมื่อ กกต. ออกระเบียบใหม่ แก้ไฟล์นี้ไฟล์เดียวพอ
 */

// ──────────────────────────────────────────────
// ค่าอาหาร
// ──────────────────────────────────────────────

export const FOOD_RATES = {
  normal:  { main: 300, snack: 50 },   // ทั่วไป (สนง., ราชการ)
  hotel:   { main: 400, snack: 100 },  // โรงแรม / รีสอร์ท / ศูนย์แสดงสินค้าฯ
}

/**
 * คำนวณมื้อที่เบิกได้
 * @param {string} startTime  "HH:MM"
 * @param {string} endTime    "HH:MM"
 * @param {number} durationHours  ความยาวกิจกรรม (ชั่วโมง)
 * @param {boolean} isOvernight   ค้างคืน (วันกลาง ≠ วันสุดท้าย)
 * @returns {{ main: string[], snack: number }}
 *   main = ['lunch','dinner'] | snack = จำนวนว่าง
 */
export function calcMeals({ startTime, endTime, durationHours, isOvernightMiddleDay = false }) {
  const toMinutes = t => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }

  const start = toMinutes(startTime)
  const end   = toMinutes(endTime)
  const noon  = 12 * 60   // 12:00
  const pm5   = 17 * 60   // 17:00 — threshold คร่อมเย็น
  const pm8   = 20 * 60   // 20:00 — threshold เย็นกรณีคร่อมเที่ยง

  const main = []

  if (isOvernightMiddleDay) {
    // วันกลางค้างคืน: ได้ทั้งกลางวัน + เย็น เสมอ
    main.push('lunch', 'dinner')
    return { main, snack: 2 }
  }

  // < 4 ชม. → ไม่ได้เลย
  if (durationHours < 4) return { main: [], snack: 0 }

  const crossesNoon = start < noon && end > noon
  const crosses5pm  = start < pm5  && end > pm5

  // กลางวัน: คร่อม 12:00
  if (crossesNoon) main.push('lunch')

  // เย็น: คร่อม 17:00 (ไม่คร่อม 12:00) หรือ คร่อม 12:00 + จบ ≥ 20:00
  if (!crossesNoon && crosses5pm) main.push('dinner')
  if (crossesNoon && end >= pm8)  main.push('dinner')

  // ว่าง ตาม duration
  const snack = durationHours >= 6 ? 2 : 1

  return { main, snack }
}

// ──────────────────────────────────────────────
// ค่าวิทยากร
// ──────────────────────────────────────────────

export const SPEAKER_RULES = {
  maxPerEvent: 5,
  rates: {
    government: 600,   // ข้าราชการ/เจ้าหน้าที่รัฐ (บ./ชม.)
    general:    1200,  // บุคคลทั่วไป (บ./ชม.)
  },
  ratePerMinute: 20,   // ถ้าไม่ถึงชั่วโมง
  allowedOnMobile: false,
}

export function calcSpeakerCeiling({ hours, minutes = 0, isGovOfficer = false }) {
  const rate = isGovOfficer ? SPEAKER_RULES.rates.government : SPEAKER_RULES.rates.general
  if (hours >= 1) return rate * hours
  return SPEAKER_RULES.ratePerMinute * minutes
}

// ──────────────────────────────────────────────
// ค่าเช่าสถานที่
// ──────────────────────────────────────────────

export const VENUE_TIERS = [
  { min: 0,   max: 49,  ceiling: 2500 },
  { min: 50,  max: 99,  ceiling: 5000 },
  { min: 100, max: 149, ceiling: 7500 },
  { min: 150, max: 199, ceiling: 10000 },
  { min: 200, max: 249, ceiling: 12500 },
  { min: 250, max: Infinity, ceiling: null },  // null = ตามที่จ่ายจริง
]
export const VENUE_HOTEL_MULTIPLIER = 2
export const VENUE_ALLOWED_ON_MOBILE = false

export function calcVenueCeiling({ participants, isHotel = false }) {
  const tier = VENUE_TIERS.find(t => participants >= t.min && participants <= t.max)
  if (!tier || tier.ceiling === null) return null  // ตามจริง
  return isHotel ? tier.ceiling * VENUE_HOTEL_MULTIPLIER : tier.ceiling
}

// ──────────────────────────────────────────────
// ค่าเดินทาง
// ──────────────────────────────────────────────

export const TRAVEL_INDIVIDUAL_TIERS = [
  { min: 0,   max: 100, ceiling: 300 },
  { min: 101, max: 200, ceiling: 500 },
  { min: 201, max: 500, ceiling: 800 },
  { min: 501, max: 700, ceiling: 1500 },
  { min: 701, max: Infinity, ceiling: null },  // ตามจริง
]

export const TRAVEL_GROUP = {
  van:     { minPassengers: 5,  ceiling: 2000 },
  minibus: { minPassengers: 17, ceiling: 4000 },
  bus:     { minPassengers: 40, ceiling: 10000 },
}

export function calcTravelCeiling(distanceKm) {
  const tier = TRAVEL_INDIVIDUAL_TIERS.find(t => distanceKm >= t.min && distanceKm <= t.max)
  return tier?.ceiling ?? null
}

// ──────────────────────────────────────────────
// ค่าที่พัก
// ──────────────────────────────────────────────

export const ACCOMMODATION_RATES = {
  single:       1200,  // ห้องเดี่ยว (บ./คืน)
  double:       1600,  // ห้องคู่ (บ./คืน)
  extraPerPax:  400,   // เพิ่ม/คน/คืน ถ้า > 2 คน/ห้อง
  partyRate:    800,   // เรทพรรคให้ (บ./คืน)
}

// ──────────────────────────────────────────────
// รายการที่เบิกได้ต่อประเภทกิจกรรม
// ──────────────────────────────────────────────

export const ALLOWED_ITEMS_BY_TYPE = {
  normal: ['food', 'speaker', 'travel', 'venue', 'accommodation', 'supplies', 'equipment', 'photo'],
  mobile: ['food', 'travel', 'accommodation', 'supplies', 'equipment', 'photo'],
}

export function getAllowedItems(isMobile) {
  return isMobile ? ALLOWED_ITEMS_BY_TYPE.mobile : ALLOWED_ITEMS_BY_TYPE.normal
}

// ──────────────────────────────────────────────
// Validate — เช็คว่า amount เกิน ceiling ไหม
// returns { ok: boolean, ceiling: number|null, message: string }
// ──────────────────────────────────────────────

export function validateAmount(itemType, amount, context = {}) {
  const { isMobile, participants, isHotel, distanceKm, hours, minutes, isGovOfficer } = context

  // เช็ค allowed ก่อน
  if (isMobile && !ALLOWED_ITEMS_BY_TYPE.mobile.includes(itemType)) {
    return { ok: false, ceiling: 0, message: 'รายการนี้เบิกไม่ได้สำหรับกิจกรรมสัญจร' }
  }

  let ceiling = null

  if (itemType === 'venue') {
    ceiling = calcVenueCeiling({ participants, isHotel })
  } else if (itemType === 'speaker') {
    ceiling = calcSpeakerCeiling({ hours, minutes, isGovOfficer })
  } else if (itemType === 'travel') {
    ceiling = distanceKm != null ? calcTravelCeiling(distanceKm) : null
  } else if (itemType === 'accommodation') {
    ceiling = ACCOMMODATION_RATES.single  // per room/night as baseline
  }

  if (ceiling === null) return { ok: true, ceiling: null, message: 'ตามที่จ่ายจริง' }
  if (amount > ceiling) return { ok: false, ceiling, message: `เกินเพดาน ${ceiling.toLocaleString()} บาท` }
  return { ok: true, ceiling, message: '' }
}
