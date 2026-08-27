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

/**
 * คำนำหน้า ref ที่คนใช้เรียกกันใน Discord — เลขรันต่อ org ไม่ผูกกระดาน (ย้ายกระดานแล้วเลขต้องไม่เปลี่ยน)
 *
 * ⭐ 'K' → 'KB' (user เคาะ 2026-08-28) · เปลี่ยนได้ฟรีเพราะ **DB เก็บแค่เลข** คำนำหน้าแปะตอนแสดงผล
 *    ไม่เอา 'kanban-' เพราะผู้ใช้เรียกโมดูลนี้ว่า "การบ้าน" ไม่ใช่ kanban + ยาวเกินจุดประสงค์
 *    (ref มีไว้พิมพ์/พูดเร็ว ถ้ายาวขนาดนั้นก็แปะลิงก์ไปเลยดีกว่า) + ชื่อโมดูลจะเปลี่ยนตอน rebrand
 *    แต่ ref ค้างในแชตตลอดกาล — คำนำหน้าที่ไม่ผูกกับชื่อโมดูลจึงทนกว่า
 * ⛔ **เปลี่ยนอีกไม่ได้แล้วโดยไม่มีต้นทุน** — ตั้งแต่วันนี้ ref ถูกใช้เป็น URL (`?card=KB-42`)
 *    และบอทพิมพ์ลงดิสฯ · ของเก่าที่คนแปะไว้จะอ่านไม่ตรงกับของใหม่
 */
export const REF_PREFIX = 'KB'

/** ref_no → ป้ายที่คนอ่าน เช่น 42 → 'KB-42' */
export function formatRef(refNo) {
  return `${REF_PREFIX}-${refNo}`
}

/**
 * 'KB-42' / 'kb 42' / '42' → 42 · อ่านไม่ออก = null (ใช้ตอนคนพิมพ์อ้างถึงการ์ดในดิสฯ)
 * ⚠️ ยังรับ 'K-42' ของเก่าด้วย — บอทพิมพ์รูปแบบนั้นลงดิสฯ ไปแล้วก่อนเปลี่ยนคำนำหน้า
 *    ข้อความเก่าลบไม่ได้ ห้ามถอด `b?` ออกจาก regex
 */
export function parseRef(input) {
  if (input == null) return null
  const m = String(input).trim().match(/^(?:kb?[\s-]*)?(\d+)$/i)
  return m ? Number(m[1]) : null
}

/**
 * ข้อความนี้เป็น "ref ที่คนอ่าน" (มีคำนำหน้า) ไม่ใช่ id ภายในใช่ไหม
 *
 * ⛔ ต่างจาก parseRef ตรงที่ **ตัวเลขล้วนไม่นับ** — จำเป็นตรงที่ URL/พาธ API รับได้ทั้ง 2 แบบ
 *    (`/api/kanban/cards/154` = id · `/api/kanban/cards/KB-42` = ref) ถ้าปล่อยให้ '42' กำกวม
 *    ลิงก์เก่าที่ใช้ id จะวิ่งไปเปิดการ์ดผิดใบเงียบๆ
 */
export function looksLikeRef(input) {
  return /^\s*kb?[\s-]*\d+\s*$/i.test(String(input ?? ''))
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

/* ══════════════ ชั้นกระดาน (ก้อน 3 · 2026-08-24) ══════════════
 * เพิ่ม **คร่อมข้างบน** ฟังก์ชันการ์ดตามที่หัวไฟล์นี้สั่งไว้ตั้งแต่ก้อน 1 — ไม่แก้ข้างในตัวเดิม
 * ⚠️ guild_id บนกระดานเป็น **ป้ายบอกที่มา ไม่ใช่ด่านสิทธิ์** — คนในเซิร์ฟ ก. เห็นกระดานของเซิร์ฟ ข.
 *    ได้ถ้า open_to_org (org เดียวกัน) · จะกันต้องกันด้วย open_to_org/members ไม่ใช่ด้วย guild
 *    (ถ้าเอา guild มาเป็นด่าน = ระบบใช้ไม่ได้ทันทีสำหรับคนที่ไม่มี Discord)
 */

/** เห็นกระดาน — open_to_org · ถูกเชิญ · ยศตรง · admin (ดีไซน์ §สิทธิ์ 4 ข้อ) */
export function canViewBoard(board, access = {}, userId = null, { memberIds = [], permissions = [] } = {}) {
  if (!board) return false
  if (isKanbanAdmin(access)) return true
  if (board.open_to_org) return true
  if (userId && memberIds.includes(userId)) return true
  if (permissions.length) {
    const p = normalizeAccess(access).permissions || new Set()
    return permissions.some((perm) => p.has(perm))
  }
  return false
}

/**
 * สร้างกระดานใหม่ — ทุกคนใน org ทำได้ (เหมือน "สร้างการบ้าน")
 * เหตุผลเดียวกับที่ไม่มี capability gate ตอนเข้าหน้า: กระดานเป็นของทุกคนในองค์กร
 * ไม่ใช่ของทีมใดทีมหนึ่ง · กันขยะด้วย "กระดานสุดท้ายลบไม่ได้" + เก็บเข้ากรุได้ ไม่ใช่ด้วยการห้ามสร้าง
 */
export function canCreateBoard(access = {}, userId = null) {
  return Boolean(userId)
}

/** แก้ชื่อ/ตั้งค่ากระดาน หรือเก็บเข้ากรุ — คนสร้างกระดาน หรือ admin */
export function canManageBoard(board, access = {}, userId = null) {
  if (!board) return false
  if (isKanbanAdmin(access)) return true
  return Boolean(userId) && board.created_by === userId
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

/** การ์ดใบนี้ผูกกับของจริง (เคส/โพสต์) อยู่ไหม — `link` มาจาก db/kanban/statusSql.js */
export function isLinkedCard(card) {
  return Boolean(card?.link)
}

/** ชื่อระบบต้นทางที่เอาไปประกอบข้อความบอกเหตุผล */
export const LINK_KIND_LABEL = { case: 'เรื่องร้องเรียน', post: 'งานสื่อ' }

/**
 * ⭐ ช่วงสถานะที่ **kanban เป็นเจ้าของ** สำหรับการ์ดที่ผูกงานสื่อ (2026-08-25)
 *
 * `post_episodes.status` มีแค่ draft/review/approved = สถานะ *บรรณาธิการ* ล้วนๆ
 * ไม่มีคำว่า "ยังไม่มีใครลงมือ" อยู่เลย → `POST_STATUS` คืน NULL ตอน draft แล้วปล่อยให้
 * `c.status_type` ถือช่วงนี้แทน (ดู db/kanban/statusSql.js) · ที่นี่คืออีกครึ่งของกติกาเดียวกัน
 */
const POST_DRAFT_PHASE = ['backlog', 'doing', 'cancelled']

/**
 * ลากการ์ดใบนี้ได้ไหม (ยังไม่นับสิทธิ์ของคน — นั่นเป็นหน้าที่ `canChangeStatus`)
 *
 * ⛔ UI ต้องเรียกตัวนี้ ห้ามเขียนเงื่อนไขซ้ำเอง — ด่านจริงอยู่ที่ `checkStatusTransition`
 *    ถ้าสองที่ตอบไม่ตรงกัน จะได้การ์ดที่ลากได้แต่ API ปฏิเสธ = เด้งกลับโดยไม่มีเหตุผลให้ผู้ใช้
 */
export function isDraggableCard(card) {
  if (!isLinkedCard(card)) return true
  return card.link?.entity_type === 'post' && POST_DRAFT_PHASE.includes(card.status_type)
}

/**
 * สถานะที่เลือกได้ในกล่องสถานะของการ์ดใบนี้ — ตัวเลือกที่เลือกไม่ได้ต้อง **ไม่โผล่**
 * ไม่ใช่โผล่แล้วกดไม่ได้ (กติกาเดียวกับ draggable: ห้ามหลอกมือ)
 */
export function statusOptionsFor(card) {
  return isLinkedCard(card) ? POST_DRAFT_PHASE.filter((s) => STATUS_TYPES.includes(s)) : STATUS_TYPES
}

/**
 * ตรวจว่าจะย้ายไปสถานะนี้ได้ไหม — กติกาที่ไม่ขึ้นกับตัวคน
 * คืน { ok, reason } เพื่อให้ UI เด้ง toast บอกเหตุผลได้ (ดีไซน์: ห้ามเด้งกลับเงียบๆ)
 */
export function checkStatusTransition(card, nextStatus) {
  if (!STATUS_TYPES.includes(nextStatus)) {
    return { ok: false, reason: 'unknownStatus' }
  }
  // ⛔ การ์ดที่ผูกของจริง: สถานะที่ **ต้นทางเป็นเจ้าของ** ล็อกไว้ ลากไม่ได้ (user เคาะ 2026-08-24)
  //    เลือกทางนี้แทน "เขียนกลับไปเปลี่ยนสถานะต้นทาง" เพราะ write-back ต้องต่อด่านสิทธิ์ + optimistic
  //    lock ของทั้ง 2 ระบบ (เตะคนที่กำลังพิมพ์โพสต์อยู่ให้เซฟไม่ได้ = 409)
  //    เปลี่ยนที่หน้าต้นทางแล้วการ์ดขยับกองเอง เพราะสถานะอ่านสดอยู่แล้ว
  //
  // ⭐ ผ่อนให้งานสื่อ **ช่วงร่าง** เท่านั้น (2026-08-25) — ช่วงนั้นต้นทางไม่มีความเห็น kanban ถือเอง
  //    เงื่อนไขดูจาก `card.status_type` ซึ่งเป็น **ค่าที่คำนวณสดแล้ว** (statusSql.js alias ทับให้)
  //    → อยู่ในช่วงร่างจริงก็ต่อเมื่อค่าสดตกมาที่ cache = ต้นทางคืน NULL · ปลอดภัยกว่าดู
  //      link.source_status ตรงๆ เพราะโพสต์ที่เผยแพร่แล้วแต่ status ยังเป็น draft ก็ถูกกันด้วย
  if (isLinkedCard(card)) {
    const draftPhase = card.link?.entity_type === 'post'
      && POST_DRAFT_PHASE.includes(card.status_type)
      && POST_DRAFT_PHASE.includes(nextStatus)
    if (!draftPhase) return { ok: false, reason: 'linked' }
  }
  // ดีไซน์ §ช่องโหว่ข้อ 5 — ไม่มีเจ้าภาพ ออกจาก backlog ไม่ได้ (DB ก็มี CHECK กันอีกชั้น)
  // ยกเว้น 'cancelled' = ช่อง "พักไว้" (ยังจะทำ แต่หาคนทำไม่ได้ตอนนี้ · 2026-08-18) — งานที่ยังไม่มีใครรับ
  // ก็พักได้ ไม่ต้องบังคับหาเจ้าภาพก่อนถึงจะเก็บเข้ากรุ (migration ผ่อน CHECK ให้แล้ว)
  if (!card?.owner_user_id && nextStatus !== 'backlog' && nextStatus !== 'cancelled') {
    return { ok: false, reason: 'needOwner' }
  }
  return { ok: true, reason: null }
}
