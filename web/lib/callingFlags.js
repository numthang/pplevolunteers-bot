// ประเมินสมาชิกโดยคน — 5 ระดับ (user เคาะ 2026-09-10 · เดิมมี 3 คือ green/yellow/red)
//
// ⚠️ ใช้จุดสี CSS ไม่ใช่ emoji: emoji วงกลมมีให้เลือกไม่ครบเฉด (ไม่มี "เทากลางๆ" สำหรับ "เฉยๆ")
//    และหน้าตาเพี้ยนข้ามเครื่อง · แต่ยืม "ค่าสี" ของ emoji มาใช้ เพื่อให้สดเท่ากัน (ดูตารางล่าง)
//
// ⛔ ห้าม hardcode รายการนี้ซ้ำที่อื่น — ก่อนหน้านี้หน้า assignments เขียนเป็น ternary
//    `flag === 'green' ? 🟢 : flag === 'yellow' ? 🟡 : 🔴` ซึ่งแปลว่า **ค่าอะไรก็ตามที่ไม่รู้จัก
//    จะกลายเป็น 🔴 เงียบๆ** — เพิ่มระดับใหม่เมื่อไหร่ก็โชว์ผิดทันที

// 🎨 hex ชุดนี้คือ **สีจริงของ emoji วงกลม** (Twemoji) — user บอกว่าสไตล์ตอน 3 วงสดกว่า
//    🟢 #78b159 · 🟡 #fdcb58 · 🟠 #f4900c · 🔴 #dd2e44 · เทา #99aab5 (จาก ⚪ ของชุดเดียวกัน)
// ⛔ อย่าเปลี่ยนกลับไปใช้โทนเข้มของ STATUS_ICONS (#1a5e2d / #a32d2d) — ลองแล้ว user ทักว่า
//    "ไม่ค่อยสว่าง" · โทนพวกนั้นออกแบบมาเป็น "สีตัวอักษร" บนพื้นอ่อน ไม่ใช่สีเม็ดกลม
export const FLAG_OPTIONS = [
  { value: 'great',   color: '#78b159', labelKey: 'assignment.flagGreat' },
  { value: 'good',    color: '#fdcb58', labelKey: 'assignment.flagGood' },
  { value: 'neutral', color: '#99aab5', labelKey: 'assignment.flagNeutral' },
  { value: 'caution', color: '#f4900c', labelKey: 'assignment.flagCaution' },
  { value: 'avoid',   color: '#dd2e44', labelKey: 'assignment.flagAvoid' },
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
      'radial-gradient(circle at 72% 82%, rgba(0,0,0,.18), rgba(0,0,0,0) 52%)',
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12), inset 0 1px 1px rgba(255,255,255,.45)',
  }
}

/** คืน option ของ flag (รองรับค่าเก่า) · ไม่รู้จัก = null ให้ผู้เรียกเลือกว่าจะไม่แสดงอะไร */
export function getFlagOption(flag) {
  if (!flag) return null
  const value = LEGACY[flag] || flag
  return FLAG_OPTIONS.find(f => f.value === value) || null
}
