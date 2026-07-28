/**
 * แบรนด์ของ platform — จุดเดียวที่แก้ตอน rebrand (ใช้ร่วมทั้ง bot และ web)
 *
 * bot:  const { BRAND_NAME } = require('../config/brand.js')
 * web:  import { BRAND_NAME } from '@/lib/brand.js'   ← re-export จากไฟล์นี้
 *
 * ⚠️ BRAND_DOMAIN เป็นแค่ fallback ตอน NEXTAUTH_URL ไม่ได้ตั้ง — ค่าจริงอยู่ .env
 *    ตอนจด platfor.org: แก้ 2 ที่ = ไฟล์นี้ + NEXTAUTH_URL ใน .env
 */
module.exports = {
  BRAND_NAME:   'PLATFOR{m}.ORG',      // ชื่อที่ user เห็น (title, footer, passkey prompt)
  BRAND_DOMAIN: 'pplevolunteers.org',  // TODO: → 'platfor.org' เมื่อจดโดเมนแล้ว
}
