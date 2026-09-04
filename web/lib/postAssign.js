/**
 * มอบหมาย / ถอนตัว งานสื่อ — **ทางเดียวที่ระบบอนุญาตให้เปลี่ยนผู้รับผิดชอบโพสต์**
 *
 * ⭐ คู่แฝดของ `lib/caseAssign.js` — เหตุผลที่ต้องเป็น service ไม่ใช่เรียก db ตรงๆ เหมือนกันเป๊ะ:
 *    การเปลี่ยนผู้รับผิดชอบมี side effect ที่ต้องเกิดพร้อมกันเสมอ ไม่ว่าจะกดมาจากหน้าไหน
 *      1. `post_assignees` (ความจริง)
 *      2. sync การ์ด kanban — `kanban_card_assignees` เป็น **สำเนา** ไม่ได้อ่านสด
 *      3. audit log
 *    บั๊กที่งานนี้มาแก้คือข้อ 2 ไม่มีใครทำ: กด "รับงาน" บนบอร์ด แล้วกลับไปหน้า /posts เห็นคนละคน
 *
 * ⛔ ห้ามเรียก `addPostAssignee`/`removePostAssignee` จาก `db/posts/episodes.js` ตรงๆ จาก route ใดๆ
 *
 * ⚠️ **ไม่ ping Discord** ต่างจากเคส — เคสมี `discord_thread_id` ที่เป็นเธรดของเรื่องนั้นเรื่องเดียว
 *    ส่วนโพสต์มีแค่ `channel_id` ซึ่งคือ **ห้องต้นทางของตะกร้าสื่อ** ไม่ใช่เธรดต่อโพสต์
 *    (ห้องเดิมเปิดตะกร้าใหม่ได้เรื่อยๆ — ดู `ensureOpenEpisode` ใน db/mediaBasket.js)
 *    ยิงเข้าไปทุกครั้งที่มอบหมาย = สแปมห้องรวมของทีมสื่อ · อยากได้จริงต้องมีเธรดต่อโพสต์ก่อน
 */

import { getPost, getPostAssignees, addPostAssignee, removePostAssignee } from '@/db/posts/episodes.js'
import { syncPostCardPeople } from '@/db/kanban/links.js'
import { logAction } from '@/db/auditLog.js'

/**
 * @param {number} orgId
 * @param {object} post     ต้องมี id, visibility (แถวจาก getPost)
 * @param {number} userId   คนที่จะเป็นผู้รับผิดชอบ
 * @returns {Promise<{assignees: object[]}>}
 */
export async function assignPost(orgId, post, userId, { actorUserId, app = 'posts' } = {}) {
  await addPostAssignee(post.id, orgId, userId)
  await syncPostCardPeople(post.id)

  logAction({
    orgId, app, action: 'post.assigned', actorId: actorUserId, targetId: String(post.id),
    meta: { assignedToUserId: userId },
  })

  return { assignees: await getPostAssignees(post.id, orgId) }
}

/** ถอนตัว/ถอดคนอื่น — การ์ดที่เหลือ 0 คนจะถูก trigger ใน DB ดันกลับกอง "รอทำ" ให้เอง */
export async function unassignPost(orgId, post, userId, { actorUserId, app = 'posts' } = {}) {
  await removePostAssignee(post.id, userId)
  await syncPostCardPeople(post.id)

  logAction({
    orgId, app, action: 'post.unassigned', actorId: actorUserId, targetId: String(post.id),
    meta: { removedFromUserId: userId },
  })

  return { assignees: await getPostAssignees(post.id, orgId) }
}

/**
 * การ์ด kanban ใบนี้ผูกโพสต์ไหม → คืนแถวโพสต์ (null = ไม่ได้ผูกโพสต์)
 * ⚠️ เรียกได้หลังผ่าน `cardContext` แล้วเท่านั้น — ตัวนั้นใช้ getCardForViewer ซึ่งกรองด้วย
 *    `visibleLinkSql` อยู่แล้ว (ร่างส่วนตัวของคนอื่นมองไม่เห็นการ์ดตั้งแต่แรก)
 */
export async function postOfCard(orgId, card) {
  if (card?.link?.entity_type !== 'post') return null
  const post = await getPost(Number(card.link.entity_id))
  return post && post.org_id === orgId ? post : null
}

/**
 * ⛔ ใส่ **คนอื่น** เป็นผู้รับผิดชอบได้เฉพาะงานที่ทีมเห็นแล้ว
 *    ร่างส่วนตัวมีคนเห็นคนเดียวคือเจ้าของ (`visibleLinkSql` ใน db/kanban/statusSql.js)
 *    → ยัดคนอื่นลงไป = เขาได้งานที่ตัวเองเปิดดูไม่ได้ และสำเนาบนการ์ดจะไม่มีวันตรงกับต้นทาง
 */
export function canAssignPost(post) {
  return post?.visibility === 'org'
}

/**
 * ⭐ **ตัวเอง** รับงานได้ตั้งแต่ยังเป็นร่างส่วนตัว (user เคาะ 2026-09-04)
 *
 *    เดิมบล็อกทุกทาง แล้วไปยัดเจ้าของให้อัตโนมัติตอน `promoteToOrg` แทน — กลับกฎแล้ว:
 *    promote ตอบคำถาม "ใครเห็น" ไม่ใช่ "ใครทำ" (เปิดให้ทีมเห็นเพราะอยากให้คนอื่นไปเขียนต่อก็มี)
 *    → ความเป็นเจ้าของงานต้องมาจากการกดของคนนั้นเอง ไม่ใช่ระบบเดาจาก `created_by`
 *    (กฎเดียวกับ links.js §SOURCE_SQL "ห้ามเอา created_by มาใส่ช่องผู้รับผิดชอบ")
 *
 * ⛔ ห้ามคลายเงื่อนไข `created_by` ตรงนี้เป็น "ใครก็ได้ใน org" — บนร่างส่วนตัว คนอื่นไม่ควรมีชื่อ
 *    แม้แต่แอดมินที่อ่านได้ (เซตผู้รับผิดชอบของร่างส่วนตัวมีได้แค่ {} หรือ {เจ้าของ})
 */
export function canSelfAssignPost(post, userId) {
  if (post?.visibility === 'org') return true
  return post?.visibility === 'personal' && Number(post?.created_by) === Number(userId)
}

/**
 * ⭐ ด่านเดียวที่ทุก route ต้องเรียก — คืน**ข้อความ error** ถ้าทำไม่ได้ · null = ผ่าน
 *    (ประตูเข้ามี 3 ทาง: /api/posts/[id]/assign · /api/kanban/cards/[id]/assignees · path claim
 *     ใน /api/kanban/cards/[id] — ข้อความต้องตรงกันทั้งสามทาง ไม่งั้นคนกดเจอคำอธิบายคนละเรื่อง)
 * ⚠️ 400 ไม่ใช่ 403 — ไม่ใช่เรื่องสิทธิ์ของคนกด แต่เป็นเรื่องที่ใบนี้ยังไม่ใช่งานของทีม
 */
export function postAssignBlock(post, targetUserId, actorUserId) {
  if (Number(targetUserId) === Number(actorUserId)) {
    return canSelfAssignPost(post, actorUserId) ? null : 'ร่างส่วนตัวของคนอื่น — รับงานแทนเจ้าของไม่ได้'
  }
  return canAssignPost(post) ? null : 'ร่างส่วนตัวเพิ่มคนอื่นไม่ได้ — เปิดให้ทีมเห็นก่อน'
}
