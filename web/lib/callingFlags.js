// ประเมินสมาชิกโดยคน — 5 ระดับ (user เคาะ 2026-09-10 · เดิมมี 3 คือ green/yellow/red)
//
// ⚠️ ใช้จุดสี CSS ไม่ใช่ emoji: emoji วงกลมมีให้เลือกไม่ครบเฉด (ไม่มี "เทากลางๆ" สำหรับ "เฉยๆ")
//    และหน้าตาเพี้ยนข้ามเครื่อง · hex ทุกตัวหยิบจากที่ใช้อยู่แล้วในโปรเจกต์ (STATUS_ICONS/TIER_COLORS)
//    ไม่ได้ตั้งสีใหม่
//
// ⛔ ห้าม hardcode รายการนี้ซ้ำที่อื่น — ก่อนหน้านี้หน้า assignments เขียนเป็น ternary
//    `flag === 'green' ? 🟢 : flag === 'yellow' ? 🟡 : 🔴` ซึ่งแปลว่า **ค่าอะไรก็ตามที่ไม่รู้จัก
//    จะกลายเป็น 🔴 เงียบๆ** — เพิ่มระดับใหม่เมื่อไหร่ก็โชว์ผิดทันที

export const FLAG_OPTIONS = [
  { value: 'great',   color: '#1a5e2d', labelKey: 'assignment.flagGreat' },
  { value: 'good',    color: '#0d9e94', labelKey: 'assignment.flagGood' },
  { value: 'neutral', color: '#9ca3af', labelKey: 'assignment.flagNeutral' },
  { value: 'caution', color: '#d97706', labelKey: 'assignment.flagCaution' },
  { value: 'avoid',   color: '#a32d2d', labelKey: 'assignment.flagAvoid' },
]

export const FLAG_VALUES = FLAG_OPTIONS.map(f => f.value)

// ค่าเก่าจากตอนมี 3 ระดับ — prod ยังไม่มีสักแถว (เช็ค 2026-09-10) แต่ dev มี
// เก็บ alias ไว้ให้แถวเก่ายังแสดงถูก ไม่ต้องทำ migration
const LEGACY = { green: 'good', yellow: 'caution', red: 'avoid' }

/**
 * สไตล์เม็ดสีให้ดู "มีมิติ" แบบ emoji วงกลม (skeuomorphic / glossy)
 * ─ ไฮไลต์แสงมุมบนซ้าย + เงาในมุมล่างขวา + ขอบในบางๆ = สิ่งที่ทำให้ emoji ไม่ดูแบน
 * ─ ใช้ overlay ขาว/ดำทับสีพื้น จึงใช้ได้กับ hex อะไรก็ได้ ไม่ต้องคำนวณสีอ่อน/เข้ม
 * ⚠️ ต้องเป็นค่า inline — สีมาจากข้อมูล ไม่ใช่คลาสคงที่ที่ Tailwind รู้ล่วงหน้า
 */
export function flagDotStyle(color) {
  return {
    backgroundColor: color,
    backgroundImage:
      'radial-gradient(circle at 32% 26%, rgba(255,255,255,.55), rgba(255,255,255,0) 46%),' +
      'radial-gradient(circle at 72% 82%, rgba(0,0,0,.28), rgba(0,0,0,0) 52%)',
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.18), inset 0 1px 1px rgba(255,255,255,.35)',
  }
}

/** คืน option ของ flag (รองรับค่าเก่า) · ไม่รู้จัก = null ให้ผู้เรียกเลือกว่าจะไม่แสดงอะไร */
export function getFlagOption(flag) {
  if (!flag) return null
  const value = LEGACY[flag] || flag
  return FLAG_OPTIONS.find(f => f.value === value) || null
}
