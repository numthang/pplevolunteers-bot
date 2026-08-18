/**
 * Kanban Access Control — ก้อน 1 ("การบ้านของฉัน" · ยังไม่มีกระดาน)
 *
 * ดีไซน์: md/kanban/KANBAN.md §สิทธิ์
 *
 * ⚠️ ก้อนนี้ **ยังไม่มี kanban_boards** → ไม่มีสิทธิ์ระดับบอร์ด (ยศ/เชิญ/open_to_org)
 *    สิทธิ์ก้อนนี้จึงมี 2 ชั้นเท่านั้น: "อยู่ใน org ไหม" + "เกี่ยวข้องกับการ์ดใบนี้ไหม"
 *    ถึงก้อน 3 ให้เพิ่มชั้นบอร์ด **คร่อมข้างบน** ฟังก์ชันพวกนี้ ไม่ใช่แก้ข้างใน
 *
 * ⛔ ไม่สร้าง permission ใหม่ระดับ org — ใช้ยศเดิมใน lib/permissions.js (ดีไซน์ §สิทธิ์)
 *    การบ้านเป็นของ "ทุกคนในองค์กร" ไม่ใช่ของทีมใดทีมหนึ่ง → ไม่ต้องมี capability gate ตอนเข้าหน้า
 *
 * ⚠️ Debug mode ("View as role") ทำให้ discordId/userId เป็น null → ownership หายแต่ยศยังอยู่
 *    ทุกฟังก์ชันที่นี่รับ userId แล้วเช็ค null เสมอ (ดีไซน์ §สิทธิ์ — ต้องเทสโหมดนี้ก่อน ship)
 */

import { normalizeAccess } from './roleAccess.js'

/** ประเภทสถานะ 6 แบบ — ห้ามเพิ่ม/ลด (ดีไซน์ §ประเภทสถานะ) */
export const STATUS_TYPES = ['backlog', 'doing', 'review', 'ready', 'done', 'cancelled']

/** สถานะที่ถือว่า "จบแล้ว" — ไม่ต้องขึ้นหน้าการบ้านของฉัน */
export const CLOSED_STATUS = ['done', 'cancelled']

/** คำนำหน้า ref ที่คนใช้เรียกกันใน Discord — เลขรันต่อ org ไม่ผูกกระดาน (ย้ายกระดานแล้วเลขต้องไม่เปลี่ยน) */
export const REF_PREFIX = 'K'

/** ref_no → ป้ายที่คนอ่าน เช่น 42 → 'K-42' */
export function formatRef(refNo) {
  return `${REF_PREFIX}-${refNo}`
}

/** 'K-42' / 'k 42' / '42' → 42 · อ่านไม่ออก = null (ใช้ตอนคนพิมพ์อ้างถึงการ์ดในดิสฯ) */
export function parseRef(input) {
  if (input == null) return null
  const m = String(input).trim().match(/^(?:k[\s-]*)?(\d+)$/i)
  return m ? Number(m[1]) : null
}

/** Admin / เลขาธิการ — เห็นและจัดการได้ทุกการ์ดใน org */
export function isKanbanAdmin(access = {}) {
  const p = normalizeAccess(access).permissions || new Set()
  return p.has('admin') || p.has('secretary_general')
}

/**
 * ลบถาวร (เทถังขยะ) — **admin เท่านั้น** แคบกว่า isKanbanAdmin ที่รวมเลขาธิการด้วย
 *
 * ใช้แค่ 2 ที่: ลบ field ถาวร · ลบการ์ดถาวร — ทั้งคู่ย้อนไม่ได้และกระทบทั้งกระดาน
 * ⛔ **ห้ามเอาไปคุม option** — ลบตัวเลือกเป็นงานประจำวัน ใครแก้การ์ดได้ก็ลบได้ (ดีไซน์ §A0)
 *    ตั้ง gate ตรงนั้นเมื่อไหร่ = flow "พิมพ์ชื่อใหม่ = สร้างตัวเลือก" ใช้ไม่ได้ทันที
 */
export function canPurge(access = {}) {
  return (normalizeAccess(access).permissions || new Set()).has('admin')
}

/**
 * คนที่ "เกี่ยวข้อง" กับการ์ดใบนี้ — เจ้าภาพ · คนช่วย · คนสร้าง
 * @param {object} card  { owner_user_id, created_by, helper_ids? }
 * @param {number|null} userId
 */
export function isCardStakeholder(card, userId) {
  if (!card || !userId) return false           // debug mode (userId null) → ไม่ใช่ stakeholder
  if (card.owner_user_id === userId) return true
  if (card.created_by === userId) return true
  return (card.helper_ids || []).includes(userId)
}

/**
 * เห็นการ์ด — ก้อน 1 ทุกคนใน org เห็นได้หมด
 *
 * ตั้งใจไม่มี "การ์ดส่วนตัว" (ดีไซน์ §สิทธิ์): อยากได้งานส่วนตัวให้ไปสร้างกระดานที่ไม่เชิญใครในก้อน 3
 * → ประหยัด edge case ทั้งชุด และกันไม่ให้งานหายไปอยู่ในมุมที่ทีมมองไม่เห็น
 */
export function canViewCard(card, access = {}, userId = null) {
  return Boolean(card)
}

/**
 * แก้การ์ด (ชื่อ · รายละเอียด · กำหนดส่ง · checklist · ธงติดปัญหา)
 * — คนเกี่ยวข้อง หรือ admin
 *
 * ⚠️ คนทั่วไปใน org **แก้การ์ดของคนอื่นไม่ได้** แต่ "รับงาน" ได้ (ดู canClaimCard)
 */
export function canEditCard(card, access = {}, userId = null) {
  if (!card) return false
  if (isKanbanAdmin(access)) return true
  return isCardStakeholder(card, userId)
}

/**
 * รับงานที่ยังไม่มีเจ้าภาพ / กด "ลงมือด้วย" (grill ข้อ 8 — ทั้งมอบหมายและอาสาเองได้)
 * — ใครก็ได้ใน org ตราบใดที่การ์ดยังไม่จบ
 */
export function canClaimCard(card, access = {}, userId = null) {
  if (!card || !userId) return false
  return !CLOSED_STATUS.includes(card.status_type)
}

/**
 * เปลี่ยนเจ้าภาพเป็นคนอื่น (มอบหมาย/ยึดงานคืน) — คนเกี่ยวข้อง หรือ admin
 * แยกจาก canClaimCard เพราะ "อาสาทำเอง" กับ "สั่งคนอื่นทำ" คนละเรื่อง
 */
export function canAssignOwner(card, access = {}, userId = null) {
  return canEditCard(card, access, userId)
}

/**
 * เปลี่ยนสถานะการ์ด — คนเกี่ยวข้อง หรือ admin
 *
 * ⚠️ ก้อน 4: การ์ดที่ผูกเคส/โพสต์ **ห้ามผ่านทางนี้** ต้องไปผ่านด่านของระบบต้นทาง
 *    (canApprove/canEditPost ใน postsAccess) แล้วอ่านสถานะสดกลับมา — ดีไซน์ §กฎเหล็ก + §ด่านที่ 2
 */
export function canChangeStatus(card, access = {}, userId = null) {
  return canEditCard(card, access, userId)
}

/** เก็บการ์ดเข้ากรุ (soft delete) — คนสร้าง หรือ admin เท่านั้น · เจ้าภาพ/คนช่วยลบไม่ได้ */
export function canArchiveCard(card, access = {}, userId = null) {
  if (!card) return false
  if (isKanbanAdmin(access)) return true
  return Boolean(userId) && card.created_by === userId
}

/**
 * ตรวจว่าจะย้ายไปสถานะนี้ได้ไหม — กติกาที่ไม่ขึ้นกับตัวคน
 * คืน { ok, reason } เพื่อให้ UI เด้ง toast บอกเหตุผลได้ (ดีไซน์: ห้ามเด้งกลับเงียบๆ)
 */
export function checkStatusTransition(card, nextStatus) {
  if (!STATUS_TYPES.includes(nextStatus)) {
    return { ok: false, reason: 'unknownStatus' }
  }
  // ดีไซน์ §ช่องโหว่ข้อ 5 — ไม่มีเจ้าภาพ ออกจาก backlog ไม่ได้ (DB ก็มี CHECK กันอีกชั้น)
  // ยกเว้น 'cancelled' = ช่อง "พักไว้" (ยังจะทำ แต่หาคนทำไม่ได้ตอนนี้ · 2026-08-18) — งานที่ยังไม่มีใครรับ
  // ก็พักได้ ไม่ต้องบังคับหาเจ้าภาพก่อนถึงจะเก็บเข้ากรุ (migration ผ่อน CHECK ให้แล้ว)
  if (!card?.owner_user_id && nextStatus !== 'backlog' && nextStatus !== 'cancelled') {
    return { ok: false, reason: 'needOwner' }
  }
  return { ok: true, reason: null }
}
