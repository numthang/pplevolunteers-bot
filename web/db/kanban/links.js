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
 * ⭐ เจ้าภาพ/คนช่วยของการ์ดที่ผูกเคส = **สำเนาของ `case_assignees`** — ตัวนี้คือที่เดียวที่เขียนสำเนานั้น
 *
 * ทำไมไม่อ่านสดเหมือนสถานะ (กฎเหล็กหัวไฟล์): `owner_user_id` เป็นคอลัมน์จริงที่ถูกใช้ใน
 * CHECK `kanban_cards_owner_required`, ตัวกรองของ listCards/listMyCards และ isMyCard
 * → เปลี่ยนเป็น subquery = รื้อทั้งโมดูล · ใช้ท่า **single writer + mirror ทันทีจังหวะเดียวกัน** แทน:
 *   `case_assignees` เป็นความจริงเสมอ · ใครจะเปลี่ยนคนต้องเขียนที่นั่นก่อน แล้วเรียกตัวนี้ทันที
 *
 * ⛔ ห้ามเขียน `kanban_cards.owner_user_id` / `kanban_card_helpers` ของการ์ดที่ผูกเคสจากที่อื่นอีก
 *    (ทางเข้าทั้งหมดต้องผ่าน `web/lib/caseAssign.js` ซึ่งเรียกตัวนี้ให้แล้ว)
 *
 * กติกา: เจ้าภาพ = assignee คนแรก (`assigned_at, user_id`) · ที่เหลือ = คนช่วย
 * ⚠️ CHECK `kanban_cards_owner_required` — ไม่มีเจ้าภาพ = อยู่ได้แค่ backlog/cancelled
 *    → ถอด assignee คนสุดท้ายต้อง clamp status_type ด้วย (คอลัมน์นี้เป็นแค่ cache
 *      การ์ดผูกเคสแสดงสถานะสดจาก `cases.status` อยู่แล้ว — clamp จึงไม่ทำให้จอเปลี่ยน)
 * ⚠️ ห้าม throw — แขวนท้าย action ของผู้ใช้ แบบเดียวกับ mirrorEntityCard
 *
 * @returns {Promise<boolean>} false = เคสนี้ไม่มีการ์ด (ยังไม่ถูก mirror) หรือทำไม่สำเร็จ
 */
export async function syncCaseCardPeople(caseId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT card_id FROM kanban_card_links WHERE entity_type = 'case' AND entity_id = $1 FOR UPDATE`,
      [caseId]
    )
    if (!rows[0]) { await client.query('ROLLBACK'); return false }
    const cardId = Number(rows[0].card_id)

    // เจ้าภาพ = assignee คนแรก · null เมื่อไม่เหลือใคร → clamp สถานะให้ไม่ชน CHECK
    await client.query(
      `UPDATE kanban_cards c
          SET owner_user_id = a.user_id,
              status_type  = CASE WHEN a.user_id IS NOT NULL THEN c.status_type
                                  WHEN c.status_type = 'cancelled' THEN 'cancelled'
                                  ELSE 'backlog' END,
              completed_at = CASE WHEN a.user_id IS NULL THEN NULL ELSE c.completed_at END,
              updated_at   = now()
         FROM (SELECT (SELECT user_id FROM case_assignees
                        WHERE case_id = $2 ORDER BY assigned_at, user_id LIMIT 1) AS user_id) a
        WHERE c.id = $1`,
      [cardId, caseId]
    )

    // คนช่วย = assignee ที่เหลือทั้งหมด — ลบส่วนเกินก่อน แล้วเติมที่ขาด
    await client.query(
      `DELETE FROM kanban_card_helpers h
        USING kanban_cards c
        WHERE c.id = h.card_id AND h.card_id = $1
          AND (h.user_id = c.owner_user_id
               OR NOT EXISTS (SELECT 1 FROM case_assignees a
                               WHERE a.case_id = $2 AND a.user_id = h.user_id))`,
      [cardId, caseId]
    )
    await client.query(
      `INSERT INTO kanban_card_helpers (card_id, user_id)
       SELECT $1, a.user_id FROM case_assignees a
         JOIN kanban_cards c ON c.id = $1
        WHERE a.case_id = $2 AND a.user_id IS DISTINCT FROM c.owner_user_id
       ON CONFLICT DO NOTHING`,
      [cardId, caseId]
    )
    await client.query('COMMIT')
    return true
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[kanban] syncCaseCardPeople ล้มเหลว case', caseId, e.message)
    return false
  } finally {
    client.release()
  }
}

/**
 * ของจริงที่ "ควรมีการ์ด แต่ยังไม่มี" — ต่อชนิด
 *
 * ⭐ โพสต์เอา **ทุกใบที่ยังไม่เข้ากรุ รวม `visibility='personal'`** (user กลับคำ 2026-08-24 รอบสอง)
 *    เดิมกรองเฉพาะ 'org' ด้วยเหตุผล "กินเลข K ทิ้งเปล่า" — เหตุผลนั้นตกไปแล้ว เพราะการ์ดที่ผูก
 *    ของจริงโชว์เลขต้นทาง ไม่ได้โชว์ K-n ผลจริงคือแค่เลข K ของการบ้านธรรมดากระโดดถี่ขึ้น
 *    ⚠️ **ไม่ใช่การเปิดให้คนอื่นเห็น** — ด่านตอนอ่าน (statusSql.js visibleLinkSql) ยอมให้เฉพาะ
 *       `visibility='org'` หรือ `owner_user_id = คนดู` → ร่างส่วนตัวขึ้นบอร์ดของเจ้าของคนเดียว
 *    ⛔ `archived_at IS NULL` ยังต้องอยู่ — โพสต์ที่เข้ากรุแล้วไม่ใช่งานค้าง
 *
 * ⭐ เจ้าภาพลากมาจากต้นทางให้เลย ไม่ปล่อยว่าง — การ์ดที่ไม่มีเจ้าภาพจะไปโผล่ใน "การบ้านของฉัน"
 *    ของทุกคน (isMyCard นับงานไม่มีเจ้าภาพเป็นของทุกคน) · เคส 200 ใบไม่มีเจ้าภาพ = หน้าแรกพังทั้งทีม
 *      เคส  → assignee คนแรก (คนที่เหลือกลายเป็นคนช่วย)
 *      โพสต์ → owner_user_id ตรงๆ
 */
const SOURCE_SQL = {
  case: `SELECT c.id,
                COALESCE(NULLIF(c.title, ''), 'เรื่องร้องเรียน ' || c.ref) AS title,
                (SELECT a.user_id FROM case_assignees a
                  WHERE a.case_id = c.id ORDER BY a.assigned_at, a.user_id LIMIT 1) AS owner_user_id,
                c.created_by
           FROM cases c
          WHERE c.org_id = $1 AND c.archived_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM kanban_card_links l
                             WHERE l.entity_type = 'case' AND l.entity_id = c.id)
          ORDER BY c.id`,

  post: `SELECT p.id,
                COALESCE(NULLIF(p.title, ''), 'งานสื่อ #' || p.id) AS title,
                p.owner_user_id,
                p.owner_user_id AS created_by
           FROM post_episodes p
          WHERE p.org_id = $1 AND p.archived_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM kanban_card_links l
                             WHERE l.entity_type = 'post' AND l.entity_id = p.id)
          ORDER BY p.id`,
}

/**
 * ⭐ กวาดให้ครบ — "ของจริงทุกชิ้นต้องมีการ์ด" (user เคาะ: *ต้องมี ทุกใบ*)
 *
 * ทำไมต้องมีทั้ง hook และตัวกวาด: ทางสร้างเคส/โพสต์มีหลายทาง (เว็บ · บอท · สคริปต์ import)
 * แขวน hook ให้ครบทุกทางแล้วยังพลาดได้เสมอ → ตัวกวาดคือตาข่ายที่ทำให้ "ครบทุกใบ" เป็นจริง
 * เรียกซ้ำได้ปลอดภัย · ใช้ทั้งตอน backfill ของเก่าและตอนตามเก็บที่ hook พลาด
 *
 * @param {number} orgId
 * @param {{entityType?: 'case'|'post', createdBy: number, statusType?: string, onProgress?: Function}} opts
 *        createdBy = คนที่ใช้เป็นผู้สร้างการ์ดเมื่อต้นทางไม่มี (เคสจากฟอร์มสาธารณะ created_by เป็น null)
 *        statusType = ใส่ตอนกวาด backfill ของเก่าที่จบงานแล้ว (เช่น 'done') กันไม่ให้ไปกอง
 *        "กำลังทำ" default — ดูเงื่อนไขจริงที่ mirrorEntityCard
 */
export async function reconcileEntityCards(orgId, { entityType = null, createdBy, statusType = null, onProgress } = {}) {
  const types = entityType ? [entityType] : ENTITY_TYPES
  const stats = { created: 0, failed: 0 }

  for (const type of types) {
    const { rows } = await pool.query(SOURCE_SQL[type], [orgId])
    onProgress?.({ phase: 'start', type, total: rows.length })

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const cardId = await mirrorEntityCard(orgId, type, {
        id: r.id, title: r.title, ownerUserId: r.owner_user_id, statusType,
      }, r.created_by || createdBy)

      if (!cardId) stats.failed++
      else {
        stats.created++
        // เคสมีผู้รับผิดชอบได้หลายคน — คนแรกเป็นเจ้าภาพ ที่เหลือลงเป็นคนช่วย
        if (type === 'case') {
          await pool.query(
            `INSERT INTO kanban_card_helpers (card_id, user_id)
             SELECT $1, a.user_id FROM case_assignees a
              WHERE a.case_id = $2 AND a.user_id IS DISTINCT FROM $3
             ON CONFLICT DO NOTHING`,
            [cardId, r.id, r.owner_user_id]
          ).catch(() => {})
        }
      }
      onProgress?.({ phase: 'tick', type, done: i + 1, total: rows.length, stats })
    }
    onProgress?.({ phase: 'end', type, stats })
  }
  return stats
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
 * @param {object} src ข้อมูลของจริงที่ mirror มา { id, title, ownerUserId, boardId, statusType }
 *        statusType = ค่าตั้งต้นของ cache ตอนสร้าง (เช่น 'done' สำหรับ backfill ของเก่าที่จบแล้ว)
 *        มีผลจริงเฉพาะตอนต้นทางยังเป็นสถานะที่ POST_STATUS/CASE_STATUS คืน NULL (ดู statusSql.js)
 *        ไม่งั้นสถานะสดจากต้นทางจะทับอยู่ดี — ไม่ผิดกฎเหล็ก แค่ตั้งค่าเริ่มต้นให้ตรงความจริงกว่า
 * @returns {Promise<number|null>} card_id · null = ทำไม่สำเร็จ (กลืน error ไว้)
 */
export async function mirrorEntityCard(orgId, entityType, src, createdBy) {
  try {
    const existing = await getCardIdForEntity(entityType, src.id)
    if (existing) return existing

    // `kanban_cards.created_by` เป็น NOT NULL แต่ต้นทางอาจไม่มีคนสร้าง —
    // เคสจากฟอร์มสาธารณะ `cases.created_by` เป็น null (ผู้ร้องไม่ได้ล็อกอิน)
    // → ใช้คนที่สร้างกระดานแรกของ org แทน (เป็นสมาชิก org จริงเสมอ และมีแน่นอนถ้ามีกระดาน)
    const by = createdBy || (await pool.query(
      `SELECT created_by FROM kanban_boards WHERE org_id = $1 ORDER BY sort_order, id LIMIT 1`,
      [orgId]
    )).rows[0]?.created_by
    if (!by) return null

    const card = await createCard(orgId, {
      title: src.title || (entityType === 'case' ? 'เรื่องร้องเรียนไม่มีชื่อ' : 'งานสื่อไม่มีชื่อ'),
      ownerUserId: src.ownerUserId || null,
      boardId: src.boardId || null,
      statusType: src.statusType || null,
      // สถานะที่ใส่ตอนสร้างเป็นแค่ค่าตั้งต้นของคอลัมน์ cache — ของที่แสดงจริงคำนวณสดเสมอ
      // แต่ต้องไม่ขัด CHECK ของ DB (ไม่มีเจ้าภาพ = อยู่ backlog เท่านั้น) → ปล่อยให้ createCard ตัดสิน
    }, by)

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
