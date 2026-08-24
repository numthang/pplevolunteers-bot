// web/db/kanban/links.js — ผูกการ์ดกับ "ของจริง" (เคส / โพสต์)
//
// ดีไซน์: md/kanban/KANBAN.md §กฎเหล็ก + §ประเภทสถานะ
//
// ⭐ กฎเหล็กข้อเดียวที่ทั้งไฟล์นี้มีไว้บังคับ:
//    **การ์ดที่ผูกของจริงไม่เก็บสถานะเอง** — `kanban_cards.status_type` เป็นแค่ cache
//    ตอนแสดงต้องคำนวณสดจากตารางต้นทางเสมอ (สูตรอยู่ที่ statusSql.js ใช้ร่วมกับ cards.js)
//    เผลอเก็บซ้ำเมื่อไหร่ = kanban กลายเป็น "ที่เก็บงานที่ 6" ทั้งดีไซน์พังทั้งอัน
//
// ⚠️ entity_type ต้องอยู่ในทุก WHERE เสมอ — cases.id กับ post_episodes.id ช่วงเลขทับกันเต็มๆ
//    (เคสเดียวกับ contact_type ใน calling — CLAUDE.md §Known Gotchas)
//
// ⚠️ ตารางนี้ FK ได้ข้างเดียว (card_id) เพราะ entity ชี้ได้ 2 ตาราง
//    → ฝั่ง entity ต้องกวาดด้วยโค้ด: `deletePost` ลบถาวรจริง ไม่งั้นเหลือการ์ดกำพร้าเปิดแล้ว error
import pool from '../index.js'
import { createCard } from './cards.js'
import { LIVE_STATUS_SQL } from './statusSql.js'

export const ENTITY_TYPES = ['case', 'post']

/**
 * ของจริงที่การ์ดใบนี้ผูกอยู่ — null = การ์ดเปล่า (การบ้านธรรมดา)
 * @returns {Promise<{entity_type:string, entity_id:number, is_auto:boolean}|null>}
 */
export async function getLink(cardId) {
  const { rows } = await pool.query(
    `SELECT card_id, entity_type, entity_id, is_auto, created_at
       FROM kanban_card_links WHERE card_id = $1`,
    [cardId]
  )
  if (!rows[0]) return null
  return { ...rows[0], card_id: Number(rows[0].card_id), entity_id: Number(rows[0].entity_id) }
}

/** การ์ดของ entity นี้ — ใช้ตอนเปิดหน้า /case หรือ /posts แล้วอยากลิงก์กลับมาที่การ์ด */
export async function getCardIdForEntity(entityType, entityId) {
  const { rows } = await pool.query(
    `SELECT card_id FROM kanban_card_links WHERE entity_type = $1 AND entity_id = $2`,
    [entityType, entityId]
  )
  return rows[0] ? Number(rows[0].card_id) : null
}

/**
 * ผูกการ์ดที่มีอยู่แล้วเข้ากับของจริง (คนกดผูกเอง → is_auto = false)
 *
 * ⛔ 1:1 สองทาง — การ์ดผูกได้ของเดียว และของชิ้นหนึ่งมีการ์ดได้ใบเดียว
 *    ชนอันไหนก็ตอบเหตุผลกลับไป **ห้ามเงียบ** (UI ต้องบอกได้ว่าไปดูการ์ดไหนแทน)
 * @returns {{ok:true}|{ok:false, reason:'card_taken'|'entity_taken', cardId?:number}}
 */
export async function linkCard(orgId, cardId, entityType, entityId, { isAuto = false } = {}) {
  if (!ENTITY_TYPES.includes(entityType)) throw new Error(`entity_type ไม่รู้จัก: ${entityType}`)

  // การ์ดต้องเป็นของ org นี้จริง — กัน cross-org write (ตารางลิงก์ไม่มี org_id ของตัวเอง)
  const { rows: own } = await pool.query(
    `SELECT id FROM kanban_cards WHERE org_id = $1 AND id = $2`, [orgId, cardId]
  )
  if (!own[0]) return { ok: false, reason: 'card_taken' }

  const existing = await getLink(cardId)
  if (existing) {
    if (existing.entity_type === entityType && Number(existing.entity_id) === Number(entityId)) return { ok: true }
    return { ok: false, reason: 'card_taken' }
  }

  const taken = await getCardIdForEntity(entityType, entityId)
  if (taken) return { ok: false, reason: 'entity_taken', cardId: taken }

  await pool.query(
    `INSERT INTO kanban_card_links (card_id, entity_type, entity_id, is_auto)
     VALUES ($1, $2, $3, $4)`,
    [cardId, entityType, entityId, isAuto]
  )
  return { ok: true }
}

/**
 * ถอดลิงก์ — การ์ดกลับเป็นการบ้านธรรมดา
 * ⚠️ status_type ที่ค้างอยู่ในคอลัมน์คือ cache เก่า อาจไม่ตรงกับที่เพิ่งเห็นบนจอ
 *    → เขียนสถานะสดล่าสุดกลับลงคอลัมน์ก่อนถอด ไม่งั้นการ์ดเด้งกลับไปสถานะเมื่อชาติที่แล้ว
 *
 * ⛔ **การ์ดที่ไม่มีเจ้าภาพเขียนสถานะสดกลับตรงๆ ไม่ได้** — ชน CHECK `kanban_cards_owner_required`
 *    (ไม่มีเจ้าภาพ = อยู่ได้แค่ backlog/cancelled) · เคสจริง: เคสปิดแล้ว การ์ดสถานะสด = done
 *    แต่ไม่เคยมีใครรับ → INSERT พังตอนถอด (เจอตอน smoke test 2026-08-24)
 *    → clamp เป็น `backlog` ซึ่งเป็นความจริงที่ kanban เหลืออยู่จริงๆ หลังถอด: "ไม่มีใครถืองานใบนี้"
 *      (ถอดลิงก์แล้ว kanban ไม่รู้แล้วว่าเคสปิดไปแล้ว — ข้อมูลนั้นอยู่ที่ /case ไม่ใช่ที่นี่)
 */
export async function unlinkCard(orgId, cardId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT l.card_id FROM kanban_card_links l
         JOIN kanban_cards c ON c.id = l.card_id AND c.org_id = $1
        WHERE l.card_id = $2 FOR UPDATE OF l`,
      [orgId, cardId]
    )
    if (!rows[0]) { await client.query('ROLLBACK'); return false }

    await client.query(
      `UPDATE kanban_cards c
          SET status_type = CASE
                WHEN c.owner_user_id IS NOT NULL              THEN ${LIVE_STATUS_SQL}
                WHEN ${LIVE_STATUS_SQL} = 'cancelled'         THEN 'cancelled'
                ELSE 'backlog' END,
              completed_at = CASE WHEN c.owner_user_id IS NOT NULL AND ${LIVE_STATUS_SQL} = 'done'
                                  THEN COALESCE(c.completed_at, now()) ELSE NULL END,
              updated_at = now()
        WHERE c.org_id = $1 AND c.id = $2`,
      [orgId, cardId]
    )
    await client.query(`DELETE FROM kanban_card_links WHERE card_id = $1`, [cardId])
    await client.query('COMMIT')
    return true
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/** ลบการ์ดของ entity ที่ถูกลบถาวร — เรียกจาก deletePost (โพสต์ hard delete ได้จริง) */
export async function deleteCardForEntity(entityType, entityId) {
  const { rows } = await pool.query(
    `DELETE FROM kanban_cards c
      USING kanban_card_links l
      WHERE l.card_id = c.id AND l.entity_type = $1 AND l.entity_id = $2
      RETURNING c.id`,
    [entityType, entityId]
  )
  return Boolean(rows[0])
}

/**
 * ⭐ auto-mirror — "ของจริงทุกชิ้นต้องมีการ์ด" (user เคาะ 2026-08-24: *ต้องมี ทุกใบ*)
 *
 * เรียกซ้ำได้ปลอดภัย (idempotent): มีการ์ดอยู่แล้ว → คืนใบเดิม ไม่สร้างซ้ำ
 * ใช้ได้ทั้งตอนสร้างของใหม่ (hook) และตอนกวาดของเก่า (สคริปต์ backfill)
 *
 * ⚠️ **ห้าม throw** — ตัวนี้ถูกแขวนท้ายการสร้างเคส/โพสต์ ถ้าพังต้องไม่ลากงานหลักล้มตาม
 *    (แบบเดียวกับ auditLog ที่เป็น fire-and-forget) → คืน null แล้วให้ reconcile ตามเก็บทีหลัง
 *
 * @param {'case'|'post'} entityType
 * @param {object} src ข้อมูลของจริงที่ mirror มา { id, title, ownerUserId, boardId }
 * @returns {Promise<number|null>} card_id · null = ทำไม่สำเร็จ (กลืน error ไว้)
 */
export async function mirrorEntityCard(orgId, entityType, src, createdBy) {
  try {
    const existing = await getCardIdForEntity(entityType, src.id)
    if (existing) return existing

    const card = await createCard(orgId, {
      title: src.title || (entityType === 'case' ? 'เรื่องร้องเรียนไม่มีชื่อ' : 'งานสื่อไม่มีชื่อ'),
      ownerUserId: src.ownerUserId || null,
      boardId: src.boardId || null,
      // สถานะที่ใส่ตอนสร้างเป็นแค่ค่าตั้งต้นของคอลัมน์ cache — ของที่แสดงจริงคำนวณสดเสมอ
      // แต่ต้องไม่ขัด CHECK ของ DB (ไม่มีเจ้าภาพ = อยู่ backlog เท่านั้น) → ปล่อยให้ createCard ตัดสิน
    }, createdBy)

    const res = await linkCard(orgId, card.id, entityType, src.id, { isAuto: true })
    if (!res.ok) {
      // อีกทางสร้างตัดหน้าไปแล้ว (เว็บ + บอทยิงพร้อมกัน) → ทิ้งใบที่เพิ่งสร้าง คืนใบที่ชนะ
      if (res.reason === 'entity_taken') {
        await pool.query(`DELETE FROM kanban_cards WHERE id = $1`, [card.id])
        return res.cardId
      }
      return null
    }
    return Number(card.id)
  } catch (e) {
    console.error('[kanban] mirrorEntityCard ล้มเหลว', entityType, src?.id, e.message)
    return null
  }
}
