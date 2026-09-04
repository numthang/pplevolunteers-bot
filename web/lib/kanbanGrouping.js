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
 * กำหนดส่งตั้งต้นของการ์ดที่สร้างจากปุ่ม + ในกองของโหมด "ตามกำหนดส่ง" (2026-08-24)
 *
 * ⭐ ทำไมต้องมี: ปุ่ม "เพิ่มการบ้าน" ด้านบนถูกถอดไปเป็น "เพิ่มกระดาน" (user เคาะ — เพิ่มการบ้าน
 *    ทำในกองได้อยู่แล้ว) แต่ปุ่มในกองเดิมโผล่เฉพาะโหมดสถานะ → โหมดกำหนดส่งจะไม่เหลือทางสร้างเลย
 *    เลยให้กองของโหมดนี้สร้างได้ด้วย โดยแปลความหมายของกองเป็น "กำหนดส่ง" แทนสถานะ
 *
 * คืนสตริง `YYYY-MM-DDTHH:mm` แบบ local (ชนิดเดียวกับ input datetime-local)
 * ⚠️ ห้ามคืน ISO/UTC — ทั้งสายนี้ส่งเวลาไทยดิบให้ pg (CLAUDE.md §Known Gotchas)
 * @returns {string|null} null = กองนั้นไม่ตั้งกำหนดส่ง ('none') หรือสร้างไม่ได้ ('overdue')
 */
export function defaultDueForBucket(bucket, now = new Date()) {
  // ⛔ กอง "เลยกำหนด" สร้างไม่ได้ — งานที่เกิดมาก็สายแล้วตั้งแต่วินาทีแรกไม่มีความหมาย
  if (bucket === 'overdue' || bucket === 'none') return null

  const d = new Date(now)
  if (bucket === 'week') d.setDate(d.getDate() + 7)
  if (bucket === 'later') d.setDate(d.getDate() + 30)
  d.setHours(23, 59, 0, 0)   // สิ้นวัน — คนคิดกำหนดส่งเป็น "ภายในวันนั้น" ไม่ใช่เวลาที่กดสร้าง

  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * "ของฉัน" — การ์ดที่ฉันเป็นผู้รับผิดชอบ **เท่านั้น**
 *
 * ⛔ 2026-09-03 กลับคำจากที่เคาะไว้ 2026-08-18 (เดิม: งานไม่มีเจ้าภาพ = ของฉันของทุกคน)
 *    เจตนาเดิมถูก — กองรอทำต้องมีคนเห็น ไม่งั้นงานค้างเงียบ — แต่ผลข้างเคียงคือ
 *    **"ไม่มีเจ้าภาพ" แพงจนระบบต้องยัดเจ้าภาพปลอมเข้าไป**: backfillCaseThreads.js เซ็ต
 *    assignee = เจ้าของกระทู้ 176 ใบรวดเดียว (user ต้องไล่ถอนเองบน prod) และ SOURCE_SQL.post
 *    ก็อป owner ของโพสต์ลงช่องเจ้าภาพทุกใบ = "คนนำเข้า" กลายเป็น "ผู้รับผิดชอบ"
 *
 * ⭐ ของที่มาแทน: มุมมอง "ยังไม่มีคนรับ (n)" ในแถบ "แสดง" — เป็นกองของตัวเองที่มีตัวเลขกำกับ
 *    ทั้งบนมือถือและจอใหญ่ (ดู Segmented ใน KanbanHome.jsx) → งานรอคนรับยังเห็นได้ชัด
 *    โดยไม่ต้องปนเข้าหน้าแรกของทุกคน
 * ⚠️ debug mode ("View as role") userId เป็น null → ไม่ใช่ของใครทั้งนั้น
 */
export function isMyCard(card, userId) {
  if (!card || !userId) return false
  return (card.assignee_ids || []).some((id) => String(id) === String(userId))
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

/**
 * เรียงกอง "เสร็จ" โดยเฉพาะ (2026-09-03 — user ทัก) — แยกจาก sortCards เพราะ due_at ไม่มีความหมาย
 * กับงานที่จบไปแล้ว: ใช้สูตรเดิม (due_at น้อยไปมาก) จะทำให้งานเก่าที่ due ผ่านมานานลอยขึ้นบนสุด
 * ฝังงานที่เพิ่งปิดจริงๆ ไว้ล่าง — ตัวตัดสินที่มีความหมายสำหรับกองนี้คือ "เพิ่งปิดเมื่อไหร่"
 *
 * ไม่มี completed_at (การ์ดเก่าที่ import ตรงมาเป็น "เสร็จ" โดยไม่ผ่าน setCardStatus) → ไปท้ายสุดเสมอ
 */
export function sortDoneCards(cards = []) {
  return [...cards].sort((a, b) => {
    const at = a.completed_at ? new Date(a.completed_at).getTime() : -Infinity
    const bt = b.completed_at ? new Date(b.completed_at).getTime() : -Infinity
    return bt - at
  })
}
