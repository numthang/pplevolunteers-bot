/**
 * เลขประจำตัวประชาชนไทย 13 หลัก — normalize + ตรวจ checksum (mod 11)
 *
 * ใช้เป็น "ด่านจับ OCR อ่านเพี้ยน" เป็นหลัก: vision model อ่านเลขผิด 1 ตัวจะเนียนมาก
 * (ได้เลขที่หน้าตาปกติทุกประการ) ต่างจาก Tesseract ที่พังแล้วเห็นเป็นขยะทันที
 * → เลขที่ไม่ผ่าน checksum = ห้ามปล่อยผ่านเงียบๆ ต้องให้คนกรอกยืนยัน
 *
 * ⚠️ ผ่าน checksum ไม่ได้แปลว่าเลขนี้มีอยู่จริง — แค่แปลว่า "ไม่ใช่เลขที่พิมพ์ผิด"
 */

/** เหลือแต่ตัวเลข — ตัดขีด/ช่องว่างที่คนกรอกหรือ OCR แทรกมา */
export const digitsOnly = (s) => String(s ?? '').replace(/\D/g, '')

/**
 * ตรวจ checksum หลักที่ 13
 * หลัก 1-12 คูณน้ำหนัก 13..2 → ผลรวม → (11 - sum % 11) % 10 ต้องเท่ากับหลักที่ 13
 */
export function isValidThaiId(input) {
  const d = digitsOnly(input)
  if (d.length !== 13) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i)
  return ((11 - (sum % 11)) % 10) === Number(d[12])
}

/** จัดรูปแบบให้อ่านง่าย: 1-2345-67890-12-3 (คืนค่าเดิมถ้าไม่ครบ 13 หลัก) */
export function formatThaiId(input) {
  const d = digitsOnly(input)
  if (d.length !== 13) return String(input ?? '')
  return `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}`
}
