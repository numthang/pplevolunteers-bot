// utils/parseSetting.js — normalize ค่าจาก getSetting/getUserSetting
// ค่าจาก DB มาได้ทั้ง object (json column parse แล้ว) หรือ string (บาง driver/path)
// → ทุกจุดที่อ่าน json setting เคยเขียน `typeof x === 'string' ? JSON.parse : x` ซ้ำ
// ลืมที่ไหน = bug เงียบ (เคยเจอ basket CPU spike จาก spread string ตรงๆ)

/**
 * แปลงค่า setting ให้เป็น object/array เสมอ — parse ถ้าเป็น string, คืน fallback ถ้าพัง/ว่าง
 * @param {*} value ค่าดิบจาก getSetting/getUserSetting
 * @param {*} fallback ค่าเริ่มต้นเมื่อ null/undefined หรือ parse ไม่ได้ (default {})
 */
function parseSetting(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

module.exports = { parseSetting };
