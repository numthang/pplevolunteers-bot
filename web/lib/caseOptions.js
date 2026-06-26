/**
 * Case options (categories / close reasons / status labels) — source of truth
 * `config/case-options.json` (root) ใช้ร่วมกับ bot · อ่านผ่าน fs ตาม convention เดียวกับ provinceCode.js
 */

import { readFileSync } from 'fs'
import path from 'path'
import { CODE_BY_PROVINCE } from './provinceCode.js'

const opts = JSON.parse(
  readFileSync(path.join(process.cwd(), '..', 'config', 'case-options.json'), 'utf8'),
)

export const CASE_CATEGORIES = opts.categories
export const CASE_CLOSE_REASONS = opts.closeReasons
export const STATUS_LABELS = opts.statusLabels

/** รายชื่อจังหวัดทั้งหมด เรียงตามชื่อไทย (สำหรับ picker fallback) */
export const ALL_PROVINCES = Object.keys(CODE_BY_PROVINCE).sort((a, b) => a.localeCompare(b, 'th'))

/** label ไทยของสถานะ (fallback เป็น key ถ้าไม่รู้จัก) */
export function statusLabel(status) {
  return STATUS_LABELS[status] || status
}
