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
export const CASE_REJECT_REASONS = opts.rejectReasons
export const STATUS_LABELS = opts.statusLabels

/**
 * สถานะที่ "เลือกใหม่ได้" — ต่างจาก STATUS_LABELS ที่ยังต้องมี `closed` ไว้อ่านเคสเก่า
 *
 * ⛔ `closed` (ปิดเรื่อง) เลิกใช้ 2026-09-04 — เดิมมันซ้ำกับ `resolved` (ทีมใช้ closed+"แก้ไขสำเร็จ"
 *    เป็นท่าปิดเคสมาตรฐาน 66 ครั้ง/วัน ส่วน resolved ใช้ 4 ครั้ง) และใช้ list เหตุผลชุดเดียวกับ
 *    `rejected` จนเลือกข้ามความหมายได้ (เคสที่ user เจอ: "ไม่รับดำเนินการ → แก้ไขสำเร็จ")
 *    → ย้าย closed+"แก้ไขสำเร็จ" 65 ใบไป resolved · เหลือ 16 ใบที่เหตุผลเป็นการปฏิเสธคาไว้เป็น closed
 *      **ตั้งใจไม่ย้าย** — หน้า /complaint/[ref] สาธารณะโชว์ป้ายสถานะให้ผู้ร้องเห็น การเปลี่ยน
 *      "ปิดเรื่อง" (เทา) → "ไม่รับดำเนินการ" (แดง) ย้อนหลังคือการแก้ประวัติที่ผู้ร้องเคยเห็นแล้ว
 * ⛔ ห้ามเอา closed กลับเข้ามาในนี้ · ตัวกรองในหน้ารายการยังใช้ STATUS_LABELS ครบ 5 ตัวตามเดิม
 */
export const SELECTABLE_STATUSES = ['open', 'in_progress', 'resolved', 'rejected']

/** สถานะจบเคสที่ต้องมีข้อความแจ้งผู้ร้องเรียน · `rejected` ต้องมีเหตุผลด้วย */
export const NEEDS_PUBLIC_NOTE = ['resolved', 'rejected']
export const NEEDS_REJECT_REASON = ['rejected']

/** รายชื่อจังหวัดทั้งหมด เรียงตามชื่อไทย (สำหรับ picker fallback) */
export const ALL_PROVINCES = Object.keys(CODE_BY_PROVINCE).sort((a, b) => a.localeCompare(b, 'th'))

/** label ไทยของสถานะ (fallback เป็น key ถ้าไม่รู้จัก) */
export function statusLabel(status) {
  return STATUS_LABELS[status] || status
}
