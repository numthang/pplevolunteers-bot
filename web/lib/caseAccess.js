/**
 * Case (เรื่องร้องเรียน) Access Control
 *
 * ⭐ เคาะ 2026-09-04: **ทุกคนใน org เท่ากันหมด** — ใครเห็นบอร์ด kanban ก็รับ/ทำเคสได้
 *    (user: "caseworker อาจมีสิทธิ์บางอย่างต่างออกไป แต่ตอนนี้ยังไม่มี") · ดู md/PENDING.md
 *    §Kanban ก้อน 3 · เดิม reuse getUserScope()/scope จังหวัดจาก callingAccess.js ตรงๆ
 *    — **เลิก reuse แล้ว** เพราะ calling ยังต้องจำกัดจังหวัดอยู่ (คนละ policy กันแล้ว)
 * ⛔ ถ้าจะเอา scope จังหวัดกลับมาให้เคส (เช่น ตอนมี caseworker tier จริง) แก้ที่ไฟล์นี้ที่เดียว
 *    ห้าม import getUserScope จาก callingAccess.js กลับมาตรงๆ อีก — จะดึง policy ของ calling
 *    (ซึ่งยังจำกัดจังหวัดอยู่) มาปนกับเคสโดยไม่ตั้งใจ
 */

import { isAdmin, isRegionalCoordinator, isProvincialCoordinator } from './callingAccess.js'

export { isAdmin, isRegionalCoordinator, isProvincialCoordinator }

/** บริหารเคสได้ไหม — ตอนนี้ทุกคนใน org ทำได้หมด (ไม่มี caseworker tier แยกแล้ว) */
export function canManageCases(access = {}) {
  return true
}

/** ขอบเขตจังหวัด — null = ไม่จำกัด (ทุกคนเห็นทุกจังหวัดตอนนี้) */
export function getUserScope(access = {}) {
  return null
}

/**
 * เคสจังหวัดนี้อยู่ใน scope ของ user ไหม — ตอนนี้ไม่จำกัดจังหวัดแล้ว
 * @param {string} caseProvince  จังหวัดของเคส
 * @param {object} access
 */
export function canAccessCaseProvince(caseProvince, access = {}) {
  return true
}
