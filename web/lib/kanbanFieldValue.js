// web/lib/kanbanFieldValue.js — ตรวจ+แปลงค่าดิบของ custom field ตามชนิด (pure, ไม่แตะ DB)
//
// ใช้ทั้งฝั่ง API route (ตรวจก่อนเขียน) และเทส — ต้อง pure เพื่อเทสได้โดยไม่ต้องมี DB
//
// ⚠️ checkbox ไม่มี "ค่าว่าง" — false เป็นค่าจริง ไม่ใช่การลบ (ต่างจาก 4 ชนิดที่เหลือ)
//    ที่เหลือ: ค่าว่าง/เว้นว่าง → value: null แปลว่า "ลบแถวออกจาก kanban_card_field_values"

export const FIELD_TYPES = ['text', 'number', 'url', 'date', 'checkbox']

/** ชนิด → คอลัมน์ปลายทางใน kanban_card_field_values (url ใช้ value_text ร่วมกับ text) */
export const FIELD_TYPE_COLUMN = {
  text: 'value_text',
  url: 'value_text',
  number: 'value_num',
  date: 'value_date',
  checkbox: 'value_bool',
}

const URL_RE = /^https?:\/\/\S+$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * ตรวจ+แปลงค่าดิบจากฟอร์มตามชนิด field
 * @returns {{ok: true, value: string|number|boolean|null}|{ok: false, error: string}}
 */
export function validateFieldValue(type, raw) {
  if (type === 'checkbox') return { ok: true, value: Boolean(raw) }

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
  return { ok: false, error: 'ไม่รู้จักชนิดข้อมูลนี้' }
}

/** key ในโค้ด (คงที่ตลอดชีพ) — a-z0-9_ เท่านั้น เริ่มด้วยตัวอักษร ยาวไม่เกิน 50 (คอลัมน์ VARCHAR(60)) */
export function isValidFieldKey(key) {
  return /^[a-z][a-z0-9_]{0,49}$/.test(key || '')
}
