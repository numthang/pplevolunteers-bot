/**
 * รับเรื่อง / ถอนตัว — **ทางเดียวที่ระบบอนุญาตให้เปลี่ยนผู้รับผิดชอบเคส**
 *
 * ⭐ ทำไมต้องเป็น service ไม่ใช่เรียก db/cases.js ตรงๆ: การมอบหมายเคสมี side effect 3 อย่าง
 *    ที่ต้องเกิดพร้อมกันเสมอ ไม่ว่าจะกดมาจากหน้าไหน
 *      1. `case_assignees` (ความจริง)
 *      2. sync การ์ด kanban — `owner_user_id`/`kanban_card_helpers` เป็น **สำเนา** ไม่ได้อ่านสด
 *      3. ping เธรด Discord + audit log
 *    ก่อนหน้านี้ข้อ 2 ไม่มีใครทำเลย (เจ้าภาพดริฟต์) และข้อ 3 มีเฉพาะทาง `/case`
 *    → กดรับงานจากบอร์ด kanban แล้วไม่มีใครใน Discord รู้เรื่อง
 *
 * ⛔ ห้ามเรียก `addAssignee`/`removeAssignee` จาก db/cases.js ตรงๆ จาก route ใดๆ อีก
 */

import { addAssignee, removeAssignee, getAssignees, getCaseById } from '@/db/cases.js'
import { syncCaseCardPeople } from '@/db/kanban/links.js'
import { postToThread, caseRefLink } from '@/lib/caseDiscord.js'
import { logAction } from '@/db/auditLog.js'

/**
 * @param {object} caseRow  ต้องมี id, ref, discord_thread_id
 * @param {number} userId   คนที่จะเป็นผู้รับผิดชอบ
 * @param {number} actorUserId  คนกด (สำหรับ audit)
 * @param {string|null} targetDiscordId  ใส่ถ้ารู้ — ใช้แค่ใน audit meta
 * @returns {Promise<{assignees: object[], wasFirst: boolean}>}
 *          wasFirst = คนนี้กลายเป็น "เจ้าภาพ" (assignee คนแรก) หรือเป็นผู้รับผิดชอบร่วม
 */
export async function assignCase(orgId, caseRow, userId, { actorUserId, targetDiscordId = null, app = 'cases' } = {}) {
  await addAssignee(caseRow.id, orgId, userId)
  await syncCaseCardPeople(caseRow.id)

  const assignees = await getAssignees(caseRow.id)
  const wasFirst = Number(assignees[0]?.user_id) === Number(userId)

  // ping ผู้รับผิดชอบทุกคนในเธรดของเคส (เหมือนพฤติกรรมเดิมของ /api/case/[ref]/assign)
  if (caseRow.discord_thread_id) {
    const mentions = assignees.filter(a => a.discord_id).map(a => `<@${a.discord_id}>`).join(' ')
    if (mentions) {
      await postToThread(caseRow.discord_thread_id, `👤 ผู้รับผิดชอบเคส ${caseRefLink(caseRow.ref)}: ${mentions}`)
        .catch(() => {})
    }
  }

  logAction({
    orgId, app, action: 'case.assigned', actorId: actorUserId, targetId: caseRow.ref,
    meta: { assignedTo: targetDiscordId, assignedToUserId: userId },
  })

  return { assignees, wasFirst }
}

/** ถอนตัว/ถอดคนอื่น — ไม่ ping Discord (พฤติกรรมเดิม) แต่ต้อง sync การ์ดเสมอ */
export async function unassignCase(orgId, caseRow, userId, { actorUserId, targetDiscordId = null, app = 'cases' } = {}) {
  await removeAssignee(caseRow.id, userId)
  await syncCaseCardPeople(caseRow.id)

  logAction({
    orgId, app, action: 'case.unassigned', actorId: actorUserId, targetId: caseRow.ref,
    meta: { removedFrom: targetDiscordId, removedFromUserId: userId },
  })

  return { assignees: await getAssignees(caseRow.id) }
}

/**
 * การ์ด kanban ใบนี้ผูกเคสไหม → คืนแถวเคส (null = ไม่ได้ผูกเคส เช่น การบ้านเปล่า/ผูกโพสต์)
 * ⚠️ เรียกได้หลังผ่าน `cardContext` แล้วเท่านั้น — ตัวนั้นใช้ getCardForViewer ซึ่งบังคับ
 *    manageCases + จังหวัดของเคสอยู่แล้ว (คนไม่มีสิทธิ์มองไม่เห็นการ์ดใบนี้ตั้งแต่แรก)
 */
export async function caseOfCard(orgId, card) {
  if (card?.link?.entity_type !== 'case') return null
  return await getCaseById(orgId, Number(card.link.entity_id))
}
