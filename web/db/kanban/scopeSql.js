// web/db/kanban/scopeSql.js — ตะเข็บ "ใครเห็น teamspace ไหน" (วางไว้ก่อน ยังไม่ใช้กันจริง)
//
// ⭐ รอบนี้ (2026-09-07) user สั่งว่า **ทุกคนใน org เห็นทุก teamspace ทุกบอร์ด ทุกการ์ด**
//    "permission ง่ายๆ ตอนนี้ … ค่อยจำกัดสิทธิ์ทีหลัง" → ไฟล์นี้จึงคืน TRUE เสมอ
//    มีไว้เพื่อให้วันที่จะกันจริง **ไม่ต้องรื้อ** — แก้ที่นี่ที่เดียวแล้ววางลง 3 จุดที่เรียกอยู่แล้ว
//
// ⛔ ห้ามยัดสูตรนี้ลง statusSql.js — ไฟล์นั้นประกาศตัวเองว่าเป็น "จุดเดียวที่แปลงสถานะต้นทาง
//    → status_type" และทุกก้อนในนั้นเป็น correlated subquery บน c · การมองเห็นตาม teamspace
//    เป็นคนละเรื่องกับ entity link (/scrutinize ตีตกฉบับที่เขียนไว้แบบนั้น 2026-09-07)
//
// ⛔ ห้ามทำครึ่งเดียว — ถ้าจะกันจริง ต้องวางพร้อมกันทั้ง 3 จุด ไม่งั้นได้ความเป็นส่วนตัวปลอม
//    (ซ่อนชื่อทีมแต่การ์ดยังหลุด อันตรายกว่าไม่กันเลย · cerebrum 2026-08-27):
//      1. web/lib/kanbanAccess.js  → canViewTeamspace()   (กันตอนเปิด/ลิสต์ teamspace)
//      2. web/db/kanban/cards.js   → listCards()          (กันตอนกวาดการ์ด)
//      3. web/db/kanban/cards.js   → getCardForViewer()   (กันตอนเปิดการ์ดตรงด้วยลิงก์)
//
// วันที่ทำจริง สมาชิก teamspace ให้ **คำนวณสด ห้าม materialize** (เคาะ 2026-08-27: ต้อง hook
// 6 ทางเขียน hook ไม่ครบ = สมาชิกขาดเงียบ) จาก 3 แหล่งรวมกัน:
//   ใส่ชื่อเอง (kanban_board_members ยกมาระดับ teamspace) ∪ ยศที่ผูก scope_node_id
//   ∪ สมาชิกเซิร์ฟที่ teamspace ผูกไว้ (guild_id)

/**
 * เงื่อนไข SQL ว่าคนดูคนนี้เห็นการ์ด `c` ใบไหนได้บ้าง (มองผ่านชั้น teamspace)
 *
 * @param {object} viewer  จาก kanbanViewer() ใน lib/kanbanGuard.js
 * @returns {string} SQL boolean expression — วันนี้ 'TRUE' เสมอ
 */
export function teamspaceScopeSql(viewer) { // eslint-disable-line no-unused-vars
  return 'TRUE'
}

/**
 * คนดูคนนี้เห็น teamspace อันนี้ได้ไหม (ฝั่ง JS — คู่กับ teamspaceScopeSql ฝั่ง SQL)
 * @returns {boolean} วันนี้ true เสมอ
 */
export function canSeeTeamspaceRow(teamspace, viewer) { // eslint-disable-line no-unused-vars
  return true
}
