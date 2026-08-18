// web/lib/kanbanFieldValue.js — ตรวจ+แปลงค่าดิบของ custom field ตามชนิด (pure, ไม่แตะ DB)
//
// ใช้ทั้งฝั่ง API route (ตรวจก่อนเขียน) และเทส — ต้อง pure เพื่อเทสได้โดยไม่ต้องมี DB
//
// ⚠️ checkbox ไม่มี "ค่าว่าง" — false เป็นค่าจริง ไม่ใช่การลบ (ต่างจากชนิดอื่นที่เหลือ)
//    ที่เหลือ: ค่าว่าง/เว้นว่าง → value: null แปลว่า "ลบแถวออกจาก kanban_card_field_values"
//
// ⛔ checklist ไม่ผ่านฟังก์ชันนี้เลย — ไม่มี "ค่าเดี่ยว" ให้ตั้ง (เป็นรายการ item แยกตาราง
//    kanban_card_checklist) จัดการผ่าน db/kanban/fields.js ฟังก์ชันเช็คลิสต์โดยตรง

export const FIELD_TYPES = ['text', 'number', 'url', 'date', 'checkbox', 'select', 'multi_select', 'checklist']

/** ชนิด → คอลัมน์ปลายทางใน kanban_card_field_values (url ใช้ value_text ร่วมกับ text · checklist ไม่มีคอลัมน์) */
export const FIELD_TYPE_COLUMN = {
  text: 'value_text',
  url: 'value_text',
  number: 'value_num',
  date: 'value_date',
  checkbox: 'value_bool',
  select: 'value_options',
  multi_select: 'value_options',
}

const URL_RE = /^https?:\/\/\S+$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * ตรวจ+แปลงค่าดิบจากฟอร์มตามชนิด field
 * @returns {{ok: true, value: string|number|boolean|number[]|null}|{ok: false, error: string}}
 */
export function validateFieldValue(type, raw) {
  if (type === 'checkbox') return { ok: true, value: Boolean(raw) }

  if (type === 'select' || type === 'multi_select') {
    const arr = Array.isArray(raw) ? raw : []
    const ids = [...new Set(arr.map(Number).filter(Number.isFinite))]
    if (type === 'select' && ids.length > 1) return { ok: false, error: 'เลือกได้ค่าเดียว' }
    return { ok: true, value: ids.length ? ids : null }
  }

  const s = raw == null ? '' : String(raw).trim()
  if (!s) return { ok: true, value: null }

  if (type === 'text') {
    if (s.length > 500) return { ok: false, error: 'ข้อความยาวเกิน 500 ตัวอักษร' }
    return { ok: true, value: s }
  }
  if (type === 'url') {
    if (s.length > 500) return { ok: false, error: 'ลิงก์ยาวเกิน 500 ตัวอักษร' }
    if (!URL_RE.test(s)) return { ok: false, error: 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://' }
    return { ok: true, value: s }
  }
  if (type === 'number') {
    const n = Number(s.replace(/,/g, ''))
    if (!Number.isFinite(n)) return { ok: false, error: 'ต้องเป็นตัวเลข' }
    return { ok: true, value: n }
  }
  if (type === 'date') {
    if (!DATE_RE.test(s)) return { ok: false, error: 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD' }
    return { ok: true, value: s }
  }
  return { ok: false, error: 'ชนิดข้อมูลนี้ไม่มีค่าเดี่ยวให้ตั้งผ่านทางนี้' }
}

/** key ในโค้ด (คงที่ตลอดชีพ) — a-z0-9_ เท่านั้น เริ่มด้วยตัวอักษร ยาวไม่เกิน 50 (คอลัมน์ VARCHAR(60)) */
export function isValidFieldKey(key) {
  return /^[a-z][a-z0-9_]{0,49}$/.test(key || '')
}

/**
 * label ที่คนพิมพ์ (ไทยได้) → key อัตโนมัติ — user ไม่ต้องพิมพ์ key เอง (เคาะ 2026-08-18 รอบเย็น: สร้าง field
 * แบบ inline จากในการ์ด ไม่มีหน้าแอดมินแยกให้กรอก key) label ไทยล้วน slug ไม่ได้ → fallback เป็น field_<suffix>
 * @param {string} label
 * @param {string} suffix  กันชนกัน (เช่น field id หรือสุ่ม) — ต่อท้ายเสมอเพื่อกัน uq_kanban_field_defs_key ชน
 */
export function slugifyFieldKey(label, suffix) {
  const slug = String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30)
  const base = slug || 'field'
  const key = `${base}_${suffix}`
  return key.slice(0, 50)
}
