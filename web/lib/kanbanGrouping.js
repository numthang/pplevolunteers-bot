/**
 * จัดกลุ่มการ์ด + ตัดสินว่า "ของฉัน" คือใบไหน — ตรรกะล้วน (เทสที่ lib/__tests__/kanbanGrouping.test.js)
 *
 * ⭐ หน้า /kanban เหลือหน้าเดียว (2026-08-18) — กระดานกับลิสต์เป็น **กองชุดเดียวกัน** ต่างกันแค่จอ
 *    จอ xl ขึ้นไปวาดกองเป็นคอลัมน์ · จอเล็กวาดกองซ้อนลงมา (ไม่มีปัดแนวนอนที่ไหนเลย)
 *    สิ่งที่ผู้ใช้เลือกจึงไม่ใช่ "หน้าไหน" แต่เป็น **"กองตามอะไร"** กับ **"เห็นของใคร"**
 *
 * ⛔ โหมดกำหนดส่ง (`due`) ไม่ใช่สถานะ — ห้ามเขียนกลับลง DB · เป็นแค่วิธีจัดกองบนจอ
 *    และ **ห้ามลากการ์ดในโหมดนี้** (ลากแล้วจะแปลว่าอะไรก็กำกวม — เลื่อน due? เปลี่ยนสถานะ?)
 */

import { STATUS_TYPES, CLOSED_STATUS } from './kanbanAccess.js'

/** กองของโหมด "ตามกำหนดส่ง" — เรียงตามความเร่ง ไม่ใช่ตามเวลาปฏิทิน */
export const DUE_BUCKETS = ['overdue', 'today', 'week', 'later', 'none']

/**
 * การ์ดใบนี้อยู่กองไหนของโหมดกำหนดส่ง
 * @param {string|Date|null} dueAt
 * @param {Date} now ส่งเข้ามาเพื่อให้เทสได้ (ห้ามอ่านนาฬิกาข้างในเงียบๆ)
 */
export function dueBucket(dueAt, now = new Date()) {
  if (!dueAt) return 'none'
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return 'none'

  if (due.getTime() < now.getTime()) return 'overdue'
  // "วันนี้" = วันเดียวกันตามปฏิทินท้องถิ่น ไม่ใช่ 24 ชม.ข้างหน้า (คนคิดเป็นวัน ไม่ได้คิดเป็นชั่วโมง)
  if (due.toDateString() === now.toDateString()) return 'today'

  const weekAhead = new Date(now)
  weekAhead.setDate(weekAhead.getDate() + 7)
  return due.getTime() <= weekAhead.getTime() ? 'week' : 'later'
}

/**
 * "ของฉัน" — เจ้าภาพ หรือคนช่วย **บวกงานที่ยังไม่มีใครรับ**
 *
 * ⭐ ที่ต้องรวมงานไม่มีเจ้าภาพเข้ามาด้วย (user เคาะ 2026-08-18): ตัวกรองตั้งต้นคือ "ของฉัน"
 *    ถ้ากองรอทำไม่โผล่ตรงนี้ = ไม่มีใครเห็นงานที่โยนเข้ากอง งานจะค้างเงียบตลอดกาล
 * ⚠️ debug mode ("View as role") userId เป็น null → ไม่ใช่ของใครเลย เหลือเฉพาะงานที่ไม่มีเจ้าภาพ
 */
export function isMyCard(card, userId) {
  if (!card) return false
  if (card.owner_user_id == null) return true
  if (!userId) return false
  if (String(card.owner_user_id) === String(userId)) return true
  return (card.helper_ids || []).some((id) => String(id) === String(userId))
}

/**
 * จัดการ์ดเป็นกองตามโหมด
 * @param {object[]} cards
 * @param {'status'|'due'} mode
 * @param {Date} now
 * @returns {{ key: string, cards: object[] }[]} กองครบทุกกองเสมอ (กองว่างก็คืนมา — UI ต้องวาดช่องว่างไว้ให้ลากลง)
 */
export function groupCards(cards = [], mode = 'status', now = new Date()) {
  if (mode === 'due') {
    // งานที่จบแล้ว/เข้ากรุ ไม่มีความเร่งอีกแล้ว — โผล่ในกอง "เลยกำหนด" มีแต่ทำให้ตกใจเปล่า
    const open = cards.filter((c) => !CLOSED_STATUS.includes(c.status_type))
    return DUE_BUCKETS.map((key) => ({
      key,
      cards: open.filter((c) => dueBucket(c.due_at, now) === key),
    }))
  }
  return STATUS_TYPES.map((key) => ({
    key,
    cards: cards.filter((c) => c.status_type === key),
  }))
}

/**
 * เรียงในกอง: ใกล้ครบกำหนดก่อน · ไม่มีกำหนดไปท้าย · เท่ากันใช้ความสำคัญ แล้วค่อย **ของใหม่ก่อน**
 *
 * ⭐ ตัวตัดสินสุดท้ายเป็น created_at **มากไปน้อย** (2026-08-19 — user ทัก)
 *    เดิมเป็นของเก่าก่อน → เพิ่มการ์ดใหม่ในกองแล้วมันไปโผล่ล่างสุด ทั้งที่ช่องพิมพ์อยู่บนสุด
 *    ของใหม่ก่อนตรงกับที่คนคาด: เพิ่มตรงไหน เห็นตรงนั้น
 *
 * ⛔ ยังไม่มีลำดับที่ลากจัดเองได้ (`kanban_cards` ไม่มี `sort_order`) — การ์ดที่มีกำหนดส่ง
 *    ยังขึ้นก่อนการ์ดใหม่ที่ไม่มีกำหนดเสมอ ถ้าอยากได้ลำดับมือจริงๆ ต้องเพิ่มคอลัมน์
 */
export function sortCards(cards = []) {
  return [...cards].sort((a, b) => {
    const at = a.due_at ? new Date(a.due_at).getTime() : Infinity
    const bt = b.due_at ? new Date(b.due_at).getTime() : Infinity
    if (at !== bt) return at - bt
    if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0)
    return new Date(b.created_at || 0) - new Date(a.created_at || 0)
  })
}
