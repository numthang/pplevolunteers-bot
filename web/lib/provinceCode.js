/**
 * Province → รหัสมหาดไทย (2 หลัก) — ใช้สร้าง case ref `<code>-<พ.ศ.2หลัก>-<random4>`
 *
 * Source of truth = `config/province-codes.json` (root) ใช้ร่วมกับ bot (db/case.js)
 * อ่านผ่าน fs ตาม convention เดียวกับ web/lib/cropDocument.js (process.cwd() = web/)
 * รหัสมหาดไทย = 2 หลักแรกของรหัสไปรษณีย์ (ราชบุรี=70, กาญจนบุรี=71, นครปฐม=73)
 */

import { readFileSync } from 'fs'
import path from 'path'

/** @type {Record<string,string>} ชื่อจังหวัด → รหัส 2 หลัก */
export const CODE_BY_PROVINCE = JSON.parse(
  readFileSync(path.join(process.cwd(), '..', 'config', 'province-codes.json'), 'utf8'),
)

/** คืนรหัสมหาดไทย 2 หลัก หรือ null ถ้าชื่อจังหวัดไม่รู้จัก */
export function provinceToCode(name) {
  if (!name) return null
  return CODE_BY_PROVINCE[name.trim()] ?? null
}

/** จังหวัดนี้มีอยู่จริงไหม (validate public form input) */
export function isValidProvince(name) {
  return !!provinceToCode(name)
}
