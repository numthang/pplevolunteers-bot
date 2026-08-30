// web/db/kanban/cards.js — การบ้าน (kanban_cards) ก้อน 1 · ยังไม่มีกระดาน
//
// ดีไซน์: md/kanban/KANBAN.md
//
// 3 กติกาที่ห้ามพลาด:
//   1. ⚠️ due_at เป็น local Thai time string จากฟอร์ม ("2026-08-20T17:00")
//      **ห้าม new Date(x).toISOString()** — Node ทำงานใน UTC จะ +7 ทุกครั้งที่เซฟ
//      ส่งดิบให้ pg จัดการ (เคสเดียวกับ txn_at ใน finance — CLAUDE.md §Known Gotchas)
//   2. ⚠️ ไม่ส่ง lockToken = conflict **ห้ามปล่อยผ่าน** (บทเรียน bug-071 จาก posts:
//      เดิมเขียน `if (lockToken && …)` → PATCH ที่ไม่ส่ง token ทับเนื้อหาให้ว่างแล้วตอบ 200)
//   3. ⚠️ ref_no จองแบบ MAX()+1 → 2 คนกดพร้อมกันชนกันได้ · กันด้วย UNIQUE (org_id, ref_no)
//      แล้ว retry ที่นี่ ไม่ใช่ปล่อยให้ API ตอบ 500
import pool from '../index.js'
import { displayNameSql } from '../displayName.js'
import { ensureDefaultBoard } from './boards.js'
import { LIVE_STATUS_SQL, LINK_JSON_SQL, visibleLinkSql } from './statusSql.js'

/**
 * ⭐ การ์ดที่ผูกของจริง (เคส/โพสต์) — 2 กติกาที่ไหลไปทุก query ในไฟล์นี้ (2026-08-24)
 *
 *   1. **สถานะกับชื่ออ่านสดจากต้นทาง** — `c.status_type` / `c.title` ของการ์ดพวกนี้เป็นแค่ cache
 *      เปลี่ยนสถานะเคสที่หน้า /case แล้วการ์ดต้องขยับกองเองโดยไม่มีใครลาก
 *   2. **ไม่มีสิทธิ์เห็นต้นทาง = ซ่อนการ์ดทั้งใบ** (user เคาะ) — kanban เปิดทั้ง org แต่เคสกรองจังหวัด
 *      + ต้องมียศ และโพสต์ personal เป็นของเจ้าของคนเดียว · ชื่อเรื่องร้องเรียนเป็น PII ของผู้ร้อง
 *
 * ⛔ **fail closed** — ไม่ส่ง `viewer` มา = ซ่อนการ์ดที่ผูกเคสทุกใบ
 *    ยอมให้เห็นน้อยไปดีกว่าหลุด · ทางเรียกที่ถูกต้องคือรับ `ctx.viewer` จาก kanbanGuard มาส่งต่อ
 */
const NO_VIEWER = { userId: null, canSeeCases: false, caseProvinces: [] }
const viewerParams = (v) => [v.userId ?? null, v.canSeeCases === true, v.caseProvinces ?? null]

// ป้ายเวลาที่ใช้เป็น optimistic lock token — ต้องเป็น "สตริงเดียวกันเป๊ะ" ทั้งตอนอ่านและตอนเทียบ
// (ห้ามส่ง Date ของ JS ไป-กลับ: PG เก็บ microsecond แต่ JS มีแค่ millisecond → เทียบไม่มีวันตรง)
const LOCK = `to_char(c.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

// ชื่อคนที่โชว์ — สูตรกลางอยู่ที่ db/displayName.js (เดิมก็อปไว้ที่นี่กับ people.js แล้วเตือนกันเองว่าอย่าให้ต่างกัน)
// c.org_id ใช้ได้เพราะทุกจุดที่แปะสูตรนี้อยู่ใน subquery ที่มองเห็น c อยู่แล้ว
const DISPLAY_NAME = displayNameSql('u', 'c.org_id')

// ⚠️ status_type ที่ SELECT ออกไป **ไม่ใช่คอลัมน์** — เป็นค่าที่คำนวณสดจากต้นทางถ้าการ์ดผูกของจริง
//    (คอลัมน์จริงยังอยู่ ใช้เป็น cache สำหรับการ์ดที่ไม่ได้ผูกอะไร) · ดู statusSql.js
const COLS = `
  c.id, c.org_id, c.board_id, c.ref_no, c.title, c.detail,
  ${LIVE_STATUS_SQL} AS status_type,
  ${LINK_JSON_SQL} AS link,
  c.owner_user_id, c.start_at, c.due_at, c.priority,
  c.created_by, c.created_at, c.updated_at, c.completed_at, c.archived_at,
  c.source_url, c.source_message_id,
  ${LOCK} AS lock_token`

// คนช่วยดึงมาด้วยเสมอ — การ์ดใบเดียวไม่มีทางใหญ่พอให้ต้อง lazy load
// ⚠️ งานย่อย (checklist) ไม่ได้อยู่ตรงนี้แล้ว — กลายเป็น custom field ชนิด checklist ไปแล้ว (2026-08-18 รอบเย็น)
//    อยู่ใน fields array ข้างล่างเหมือนชนิดอื่น ไม่มี checklist_total/checklist_done แบบเดิมอีกต่อไป
const AGG = `
  COALESCE((SELECT json_agg(json_build_object('user_id', h.user_id, 'name', ${DISPLAY_NAME}) ORDER BY h.joined_at)
              FROM kanban_card_helpers h JOIN users u ON u.id = h.user_id
             WHERE h.card_id = c.id), '[]'::json) AS helpers,
  -- ⛔ เคยมีคอลัมน์ labels ตรงนี้ — ถอดออก 2026-08-19 ตอนยุบป้ายเข้า custom field
  --    ชิปบนการ์ดสร้างจาก fields ข้างล่างผ่าน cardTags() ใน lib/kanbanTagFilter.js แทน
  --    (ห้ามใส่ backtick ในคอมเมนต์นี้ — ทั้งก้อนเป็น template literal ของ JS จะโดนปิดกลางคัน)
  -- ทุก field ที่ยังไม่ถูกซ่อนของ org นี้ (ไม่ใช่แค่ที่กรอกแล้ว) — ให้ UI วาดเป็นฟอร์มครบชุด ค่าที่ยังไม่กรอกเป็น null/[]
  -- ⭐ 2026-08-24 (ก้อน 3): field ผูกกระดาน 1:1 แล้ว — d.board_id = c.board_id
  --    เลิกความหมาย "board_id NULL = ของกลางใช้ได้ทุกกระดาน" ตามที่ user เคาะว่าคลังตัวเลือกห้ามข้าม board
  --    ⛔ ห้ามเติม OR d.board_id IS NULL กลับมา: field ที่หลุด NULL จะโผล่ทุกกระดานเงียบๆ
  --       แล้วคลังตัวเลือกของคนละทีมจะปนกัน (เคสเดียวกับ ปริ้นเตอร์/พรินเตอร์ แต่แยกคืนด้วยมือไม่ได้)
  COALESCE((SELECT json_agg(json_build_object(
              'field_id', d.id, 'key', d.key, 'label', d.label, 'type', d.type,
              'value', CASE
                         WHEN d.type = 'number'   THEN to_jsonb(v.value_num)
                         WHEN d.type = 'date'     THEN to_jsonb(v.value_date)
                         WHEN d.type = 'checkbox' THEN to_jsonb(v.value_bool)
                         WHEN d.type IN ('select', 'multi_select') THEN (
                           -- jsonb_agg ไม่ใช่ json_agg — CASE ต้องคืนชนิดเดียวกันทุกกิ่ง (to_jsonb ข้างบนเป็น jsonb)
                           -- ผสม json/jsonb ใน CASE เดียวกัน = 42846 "could not convert type json to jsonb" (เจอจาก smoke test)
                           -- ⛔ ห้ามใส่ o.archived_at IS NULL กลับมา (ถอดออก 2026-08-19 ค่ำ)
                           --    "ซ่อนตัวเลือก" ต้องแปลว่า "ไม่เสนอให้เลือกใหม่" ไม่ใช่ "ลบจากการ์ดที่ติดไว้แล้ว"
                           --    มีเงื่อนไขนี้เมื่อไหร่ = ซ่อนแล้วชิปหายเกลี้ยงทุกการ์ด = ลบแบบกู้ไม่ได้
                           --    (นี่คือเหตุผลที่ archive ถูกทิ้งไปรอบ 2026-08-18 — คราวนี้แก้ที่ต้นเหตุแล้ว)
                           --    รายการให้เลือกกรอง archived ที่ฝั่ง UI แทน
                           SELECT COALESCE(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'color', o.color)
                                                      ORDER BY o.sort_order, o.id), '[]'::jsonb)
                             FROM kanban_field_options o
                            WHERE o.id = ANY(v.value_options)
                         )
                         WHEN d.type = 'checklist' THEN (
                           -- ชื่อมาจากคลัง (option) ถ้าผูกไว้ — เปลี่ยนชื่อในคลังแล้วทุกการ์ดต้องเปลี่ยนตาม
                           -- i.text ใช้เมื่อ option ถูกลบ (deleteFieldOption คัดชื่อลง text ให้) หรือของเก่าก่อนมีคลัง
                           SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                    'id', i.id, 'text', COALESCE(o.name, i.text),
                                    'option_id', i.option_id, 'done', i.done)
                                                     ORDER BY i.sort_order, i.id), '[]'::jsonb)
                             FROM kanban_card_checklist i
                             LEFT JOIN kanban_field_options o ON o.id = i.option_id
                            WHERE i.card_id = c.id AND i.field_id = d.id
                         )
                         ELSE to_jsonb(v.value_text)
                       END
            ) ORDER BY d.sort_order, d.id)
              FROM kanban_field_defs d
              LEFT JOIN kanban_card_field_values v ON v.card_id = c.id AND v.field_id = d.id
             WHERE d.org_id = c.org_id AND d.archived_at IS NULL AND d.board_id = c.board_id), '[]'::json) AS fields`

const OWNER = `(SELECT ${DISPLAY_NAME} FROM users u WHERE u.id = c.owner_user_id) AS owner_name`

/** helper_ids แบนๆ ให้ kanbanAccess.isCardStakeholder ใช้ได้ตรงๆ */
function shape(row) {
  if (!row) return null
  const helpers = row.helpers || []
  const out = { ...row, helpers, helper_ids: helpers.map(h => h.user_id) }
  // ⭐ การ์ดที่ผูกของจริง: ชื่ออ่านสดจากต้นทาง — แก้ชื่อเคสที่ /case แล้วการ์ดต้องเปลี่ยนตาม
  //    ต้นทางยังไม่มีชื่อ (โพสต์ร่างที่ยังไม่ตั้งชื่อ) → ตกกลับไปใช้ชื่อที่การ์ดเก็บไว้
  if (out.link) {
    if (out.link.title) out.title = out.link.title
    out.link.entity_id = Number(out.link.entity_id)
  }
  return out
}

/**
 * การ์ดใบเดียว — **ไม่มีด่านการมองเห็นของต้นทาง** ใช้ภายในเท่านั้น
 * (ค่าที่คืนหลัง mutation · ด่านสิทธิ์ของ route ตัดสินไปแล้วก่อนถึงตรงนี้)
 * ⛔ ห้ามเรียกตัวนี้ตอบ request ตรงๆ — หน้าเว็บต้องผ่าน getCardForViewer() เท่านั้น
 */
export async function getCard(orgId, id) {
  const { rows } = await pool.query(
    `SELECT ${COLS}, ${OWNER}, ${AGG} FROM kanban_cards c WHERE c.org_id = $1 AND c.id = $2`,
    [orgId, id]
  )
  return shape(rows[0])
}

/**
 * การ์ดใบเดียวสำหรับ "คนดูคนนี้" — ผูกเคสนอกจังหวัด/โพสต์ส่วนตัวของคนอื่น → คืน null (= 404)
 * ⭐ นี่คือตัวที่ route/guard ต้องใช้ · ไม่ส่ง viewer = ซ่อนการ์ดที่ผูกเคสทุกใบ (fail closed)
 */
export async function getCardForViewer(orgId, id, viewer = NO_VIEWER) {
  const { rows } = await pool.query(
    `SELECT ${COLS}, ${OWNER}, ${AGG} FROM kanban_cards c
      WHERE c.org_id = $1 AND c.id = $2 AND ${visibleLinkSql(3, 4, 5)}`,
    [orgId, id, ...viewerParams(viewer)]
  )
  return shape(rows[0])
}

/** หาด้วยเลขที่คนพิมพ์ในดิสฯ (K-42) — ref_no ไม่ซ้ำใน org เดียวกัน */
export async function getCardByRef(orgId, refNo, viewer = NO_VIEWER) {
  const { rows } = await pool.query(
    `SELECT ${COLS}, ${OWNER}, ${AGG} FROM kanban_cards c
      WHERE c.org_id = $1 AND c.ref_no = $2 AND ${visibleLinkSql(3, 4, 5)}`,
    [orgId, refNo, ...viewerParams(viewer)]
  )
  return shape(rows[0])
}

/**
 * หน้าแรก "การบ้านของฉัน" — คืน 2 กองแยกกัน (ดีไซน์ §Views)
 *   mine    = งานที่ฉันต้องส่ง (เจ้าภาพ)
 *   helping = งานที่ฉันช่วย
 * เรียงตามกำหนดส่ง · งานที่ไม่มีกำหนดส่งไปท้ายสุด · งานที่จบแล้วไม่เอา
 */
export async function listMyCards(orgId, userId, { includeClosed = false, viewer = NO_VIEWER } = {}) {
  // ⚠️ กรองด้วยสถานะ **สด** ไม่ใช่คอลัมน์ — เคสที่เพิ่งปิดที่หน้า /case ต้องหลุดจากรายการนี้ทันที
  //    (ถ้ากรองด้วยคอลัมน์ cache การ์ดจะค้างอยู่ในงานของเจ้าภาพทั้งที่งานจบไปแล้ว)
  const closed = includeClosed ? '' : `AND ${LIVE_STATUS_SQL} NOT IN ('done','cancelled')`
  const { rows } = await pool.query(
    `SELECT ${COLS}, ${OWNER}, ${AGG},
            (c.owner_user_id = $2) AS is_owner
       FROM kanban_cards c
      WHERE c.org_id = $1
        AND c.archived_at IS NULL
        AND ${visibleLinkSql(3, 4, 5)}
        ${closed}
        AND (c.owner_user_id = $2 OR EXISTS (
              SELECT 1 FROM kanban_card_helpers h WHERE h.card_id = c.id AND h.user_id = $2))
      ORDER BY (c.due_at IS NULL), c.due_at ASC, c.priority DESC, c.created_at ASC`,
    [orgId, userId, ...viewerParams(viewer)]
  )
  const all = rows.map(shape)
  return {
    mine:    all.filter(r => r.is_owner),
    helping: all.filter(r => !r.is_owner),
  }
}

/**
 * เพดานกันระเบิด **ไม่ใช่ขนาดหน้า** — ตั้งใจให้สูงจนไม่มีวันชนในการใช้งานจริง
 *
 * ⭐ ทำไมไม่แบ่งหน้า (เคาะ 2026-08-24 หลัง /scrutinize): ตัวกรอง **และตัวเรียง** ของหน้า /kanban
 *    ทำงานฝั่ง client ทั้งคู่ (lib/kanbanTagFilter.js · lib/kanbanSort.js) และ LIMIT ถูกตัดด้วย
 *    ORDER BY due_at ตายตัวข้างล่าง ไม่เกี่ยวกับที่ผู้ใช้เลือกเรียง
 *    → มี LIMIT ที่ชนได้เมื่อไหร่ = เลือก "เรียงตามอัปเดตล่าสุด" แล้วได้ใบที่ใกล้กำหนดส่งที่สุดมาเรียงใหม่
 *      ("ไม่พบ" แปลว่า "ไม่พบในที่โหลดมา" · "เรียงแล้ว" แปลว่า "เรียงเฉพาะที่โหลดมา")
 *    ยกทั้งชุด (กรอง+เรียง+facets) ไป SQL แพงกว่ามาก และของจริงเต็มที่ราว 1,500 ใบ (user ยืนยัน)
 *    → เอา LIMIT ที่ชนได้ออก ถูกกว่าและไม่มีคำโกหกเหลือ · วัดจริง: การ์ดใบละ ~1.5KB
 *
 * ⛔ ชนเพดานนี้เมื่อไหร่ = ถึงเวลายกไป SQL จริงๆ ห้ามแก้ด้วยการดันเลขให้สูงขึ้นเฉยๆ
 *    (คนเรียกได้ `truncated: true` กลับไปเพื่อ**บอกผู้ใช้ตรงๆ** ว่ารายการไม่ครบ)
 */
export const CARD_HARD_CAP = 3000

/**
 * งานทั้ง org — ก้อน 1 ใช้กับแท็บ "งานที่ยังไม่มีคนรับ" + หน้ารวม
 * @returns {{cards: object[], truncated: boolean}} truncated = ชนเพดาน มีการ์ดที่ไม่ได้คืนมา
 */
export async function listCards(orgId, { status = null, ownerUserId = null, unassigned = false, includeArchived = false, onlyArchived = false, includeClosed = true, boardId = null, viewer = NO_VIEWER, limit = CARD_HARD_CAP } = {}) {
  // viewer อยู่ต้นแถวพารามิเตอร์เสมอ ($2–$4) — ที่เหลือ push ต่อท้ายได้ตามเดิมโดยเลขไม่ขยับ
  const params = [orgId, ...viewerParams(viewer)]
  let where = `c.org_id = $1 AND ${visibleLinkSql(2, 3, 4)}`
  // boardId = null → ทุกกระดานใน org (ตัวเลือก "ทั้งหมด" ใน dropdown = ค่าตั้งต้นของหน้าการบ้านของฉัน)
  if (boardId) { params.push(boardId); where += ` AND c.board_id = $${params.length}` }
  // onlyArchived = หน้าถังขยะ · includeArchived = เอาทั้งคู่ (ยังไม่มีใครใช้ เก็บไว้เผื่อ export)
  if (onlyArchived)          where += ` AND c.archived_at IS NOT NULL`
  else if (!includeArchived) where += ` AND c.archived_at IS NULL`
  // ⚠️ ทั้ง 2 บรรทัดนี้ใช้สถานะ **สด** ไม่ใช่คอลัมน์ — ไม่งั้นการ์ดที่ผูกเคสจะถูกคัดผิดกอง
  if (!includeClosed)   where += ` AND ${LIVE_STATUS_SQL} NOT IN ('done','cancelled')`
  if (status)           { params.push(status);      where += ` AND ${LIVE_STATUS_SQL} = $${params.length}` }
  if (ownerUserId)      { params.push(ownerUserId); where += ` AND c.owner_user_id = $${params.length}` }
  if (unassigned)       where += ` AND c.owner_user_id IS NULL`
  // ดึงเกินมา 1 ใบเพื่อ **รู้ว่าชนเพดานจริงไหม** — เทียบ rows.length === limit เฉยๆ จะเตือนผิด
  // ตอนมีการ์ดพอดีเป๊ะเท่าเพดาน (เตือนว่า "ไม่ครบ" ทั้งที่ครบ = โกหกอีกทาง)
  params.push(limit + 1)

  const { rows } = await pool.query(
    `SELECT ${COLS}, ${OWNER}, ${AGG}
       FROM kanban_cards c
      WHERE ${where}
      ORDER BY (c.due_at IS NULL), c.due_at ASC, c.priority DESC, c.created_at DESC
      LIMIT $${params.length}`,
    params
  )
  const truncated = rows.length > limit
  return { cards: rows.slice(0, limit).map(shape), truncated }
}

/**
 * สร้างการบ้าน — จอง ref_no ต่อ org
 *
 * ⚠️ หน้า Create มีปุ่มบันทึก ห้าม autosave (CLAUDE.md 2026-07-30)
 *    → ห้ามมีใครเรียกฟังก์ชันนี้ตอนกดปุ่ม "เพิ่มการบ้าน" เพื่อเปิดฟอร์มเปล่า
 *      (เคสจริงที่เคยพลาด: /posts กด "เขียนโพสต์ใหม่" แล้ว POST ทันที = ร่างเปล่าค้าง DB)
 */
export async function createCard(orgId, { title, detail = null, ownerUserId = null, startAt = null, dueAt = null, priority = 0, statusType = null, sourceUrl = null, sourceMessageId = null, boardId = null }, createdBy) {
  // board_id เป็น NOT NULL แต่คนเรียกไม่ได้ส่งมาเสมอ (บอท · context menu ในดิสฯ · สคริปต์ import)
  // → เติมกระดานตั้งต้นให้เอง สร้างให้ถ้า org ยังไม่มีสักใบ
  // ⛔ ห้ามผลักภาระนี้ไปให้คนเรียก — ทางเขียนการ์ดมีหลายทางเกินกว่าจะไล่แก้ให้ครบทุกที่ทุกครั้ง
  const board = boardId || (await ensureDefaultBoard(orgId, createdBy))
  // ไม่มีเจ้าภาพ = อยู่ backlog เท่านั้น (DB มี CHECK กันอีกชั้น — ที่นี่กันไม่ให้ยิงไปแล้วพัง)
  let status = statusType || (ownerUserId ? 'doing' : 'backlog')

  // ⭐ อีกด้านของกฎเดียวกัน: backlog = "รอทำ — ยังไม่มีเจ้าภาพ" → มีเจ้าภาพแล้วอยู่ backlog ไม่ได้
  //    DB CHECK กันได้ทางเดียว (ไม่มีเจ้าภาพห้ามออกจาก backlog) แต่ไม่กันทางนี้
  //    ถ้าปล่อยไว้จะสร้างสภาพขัดกันเองแบบ bug-406 ตั้งแต่แถวแรก — เจอตอน import ข้อมูล AppFlowy
  //    (setCardStatus อุดฝั่งแก้ไขแล้ว ที่นี่คืออุดฝั่งสร้าง)
  if (ownerUserId && status === 'backlog') status = 'doing'

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { rows } = await pool.query(
        `INSERT INTO kanban_cards (org_id, ref_no, title, detail, status_type, owner_user_id, start_at, due_at, priority, created_by, source_url, source_message_id, board_id)
         VALUES ($1,
                 (SELECT COALESCE(MAX(ref_no), 0) + 1 FROM kanban_cards WHERE org_id = $1),
                 $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [orgId, title, detail, status, ownerUserId, startAt || null, dueAt || null, priority, createdBy,
         sourceUrl || null, sourceMessageId || null, board]
      )
      return await getCard(orgId, rows[0].id)
    } catch (e) {
      // 23505 = unique_violation → อีกคนคว้า ref_no นี้ไปก่อน ลองใหม่
      if (e.code === '23505' && attempt < 4) continue
      throw e
    }
  }
}

/**
 * ทำสำเนาการ์ด — **ลอกมาหมดทุกอย่าง** ยกเว้นของที่เป็น "ประวัติ" ไม่ใช่ "เนื้องาน"
 *
 * ลอก: ชื่อ · รายละเอียด · ป้าย · ค่า custom field ทุกช่อง · รายการเช็คลิสต์ · เจ้าภาพ · คนช่วย
 *      · วันเริ่ม/กำหนดส่ง · สถานะ · ความสำคัญ
 * ไม่ลอก 3 อย่าง:
 *   1. `ref_no`  — ตัวระบุการ์ด ซ้ำไม่ได้ ต้องได้เลขใหม่
 *   2. `done` ในเช็คลิสต์ — ก๊อปงานที่เสร็จแล้วมาแล้วได้ "เตรียมของครบ 8/8" ทั้งที่ยังไม่เตรียม
 *      → **ลอกตัวรายการมาครบ แต่ติ๊กออกให้หมด**
 *   (เดิมข้อ 3 คือ blocked + blocked_reason — ถอดฟีเจอร์ออก 2026-08-18 · ลบคอลัมน์ทิ้ง 2026-08-19)
 *
 * ⚠️ **ห้ามเรียก createCard() ซ้ำ** — มันใช้ pool.query ตรงๆ (คนละ connection กับ transaction นี้)
 *    และ retry loop ของมันใช้ในทรานแซกชันไม่ได้: 23505 ทำให้ทั้ง transaction abort
 *    รอบถัดไปยิงอะไรก็ `current transaction is aborted` → ที่นี่ใช้ **SAVEPOINT** ครอบ retry แทน
 *
 * @returns {Promise<object|null>} การ์ดใบใหม่ · null = ไม่พบต้นฉบับ
 */
export async function duplicateCard(orgId, sourceId, createdBy) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: src } = await client.query(
      `SELECT * FROM kanban_cards WHERE org_id = $1 AND id = $2`, [orgId, sourceId]
    )
    if (!src[0]) { await client.query('ROLLBACK'); return null }
    const s = src[0]

    // กฎเดียวกับ createCard — มีเจ้าภาพแล้วอยู่ backlog ไม่ได้ (bug-406)
    // DB CHECK อนุญาต (ผ่านเพราะมี owner) แต่โค้ดถือเป็นสภาพขัดกันเอง อย่าให้มี 2 มาตรฐาน
    let status = s.status_type
    if (s.owner_user_id && status === 'backlog') status = 'doing'

    let newId = null
    for (let attempt = 0; attempt < 5; attempt++) {
      // ⚠️ SAVEPOINT ต่อรอบ — ไม่มีตัวนี้ 23505 จะพา transaction ทั้งก้อนตายตั้งแต่รอบแรก
      await client.query('SAVEPOINT ref_try')
      try {
        // ⚠️ board_id ต้องมาด้วยเสมอ — คอลัมน์เป็น NOT NULL (migration.sql:1161)
        //    เคยตกไป = ปุ่ม "ทำสำเนา" พังทั้งหมดด้วย 23502 (bug-… 2026-08-27)
        //    สำเนาอยู่กระดานเดียวกับต้นฉบับ ไม่ใช่กระดานตั้งต้นของ org
        const { rows } = await client.query(
          `INSERT INTO kanban_cards
             (org_id, ref_no, title, detail, status_type, owner_user_id, start_at, due_at, priority, created_by, board_id)
           VALUES ($1,
                   (SELECT COALESCE(MAX(ref_no), 0) + 1 FROM kanban_cards WHERE org_id = $1),
                   $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id`,
          [orgId, s.title, s.detail, status, s.owner_user_id, s.start_at, s.due_at, s.priority, createdBy, s.board_id]
        )
        newId = rows[0].id
        await client.query('RELEASE SAVEPOINT ref_try')
        break
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT ref_try')
        if (e.code !== '23505' || attempt === 4) throw e   // ชนกันเอง → ลองใหม่ · อย่างอื่น → ปล่อยขึ้นไป
      }
    }

    // ── ลูก 3 ตาราง: INSERT…SELECT ในทรานแซกชันเดียวกัน ──
    // ⛔ เคยลอก kanban_card_labels ด้วย — เลิกแล้ว 2026-08-19 (ป้ายยุบเข้า field)
    //    ถ้าปล่อยไว้ = ทำสำเนาการ์ดแล้วป้ายฟื้นกลับมาแบบที่ UI มองไม่เห็น
    await client.query(
      `INSERT INTO kanban_card_helpers (card_id, user_id)
       SELECT $2, user_id FROM kanban_card_helpers WHERE card_id = $1`, [s.id, newId])

    await client.query(
      `INSERT INTO kanban_card_field_values (card_id, field_id, value_text, value_num, value_date, value_bool, value_options)
       SELECT $2, field_id, value_text, value_num, value_date, value_bool, value_options
         FROM kanban_card_field_values WHERE card_id = $1`, [s.id, newId])

    // done = FALSE เสมอ — ลอกรายการมา แต่ยังไม่ได้เตรียมของ
    await client.query(
      `INSERT INTO kanban_card_checklist (card_id, field_id, option_id, text, done, sort_order)
       SELECT $2, field_id, option_id, text, FALSE, sort_order
         FROM kanban_card_checklist WHERE card_id = $1`, [s.id, newId])

    await client.query('COMMIT')
    return await getCard(orgId, newId)
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

const EDITABLE = {
  title:          'title',
  detail:         'detail',
  start_at:       'start_at',      // ⚠️ ส่งดิบ ห้ามแปลง timezone
  due_at:         'due_at',        // ⚠️ ส่งดิบ ห้ามแปลง timezone
  priority:       'priority',
}

/**
 * แก้การ์ด (autosave) — ต้องถือ lockToken ที่โหลดมา
 * @returns {{ok:true, card}|{ok:false, conflict:true, card}|{ok:false, notFound:true}}
 */
export async function updateCard(orgId, id, fields, { lockToken }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: cur } = await client.query(
      `SELECT c.id, ${LOCK} AS lock_token FROM kanban_cards c
        WHERE c.org_id = $1 AND c.id = $2 FOR UPDATE`,
      [orgId, id]
    )
    if (!cur[0]) { await client.query('ROLLBACK'); return { ok: false, notFound: true } }

    // ⚠️ ไม่มี token = conflict เหมือนกัน ห้ามปล่อยผ่าน (bug-071)
    if (cur[0].lock_token !== lockToken) {
      await client.query('ROLLBACK')
      return { ok: false, conflict: true, card: await getCard(orgId, id) }
    }

    const sets = []
    const params = [orgId, id]
    for (const [key, col] of Object.entries(EDITABLE)) {
      if (fields[key] === undefined) continue
      params.push(fields[key] === '' && col === 'due_at' ? null : fields[key])
      sets.push(`${col} = $${params.length}`)
    }
    if (sets.length) {
      await client.query(
        `UPDATE kanban_cards SET ${sets.join(', ')}, updated_at = now()
          WHERE org_id = $1 AND id = $2`,
        params
      )
    }
    await client.query('COMMIT')
    return { ok: true, card: await getCard(orgId, id) }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/**
 * เปลี่ยนสถานะ — ไม่ผ่าน lock เพราะเป็น action ปุ่มเดียว ไม่ใช่ autosave
 * ⚠️ กติกา "ไม่มีเจ้าภาพห้ามออกจาก backlog" ต้องเช็คที่ชั้น API ด้วย checkStatusTransition ก่อนเรียก
 *    (DB CHECK เป็นตาข่ายสุดท้าย ไม่ใช่ที่ที่ควรให้ผู้ใช้ไปชน)
 */
export async function setCardStatus(orgId, id, statusType) {
  // ⚠️ ต้อง cast $3 ให้ชัด — พารามิเตอร์ตัวเดียวถูกใช้ 2 บริบท (ค่าที่เซ็ต + เงื่อนไขใน CASE)
  //    ถ้าไม่ cast pg เดาชนิดไม่ตรงกันแล้วโยน 42P08 "inconsistent types deduced" (เจอตอน smoke test)
  // ⭐ backlog = "รอทำ — ยังไม่มีเจ้าภาพ" (ดีไซน์ §ประเภทสถานะ) → ย้ายมา backlog = ปล่อยงานคืนกอง
  //    ต้องถอดเจ้าภาพออกด้วย ไม่งั้นได้สภาพขัดกันเอง: การ์ด "รอทำ" ที่มีเจ้าภาพ
  //    → ไม่โผล่ในกอง "ยังไม่มีคนรับ" (กรองด้วย owner IS NULL) แต่ก็ไม่ควรอยู่ในกอง "ต้องส่ง"
  //    บังคับที่นี่ ไม่ใช่ที่ route — ทุกทางเข้า (เว็บ/บอท/cron) ต้องได้กติกาเดียวกัน
  const { rows } = await pool.query(
    `UPDATE kanban_cards
        SET status_type   = $3::varchar,
            owner_user_id = CASE WHEN $3::varchar = 'backlog' THEN NULL ELSE owner_user_id END,
            -- 'cancelled' = ช่อง "พักไว้" (ยังจะทำ แต่ไม่ใช่ตอนนี้) ไม่ใช่งานที่ทำจบ → ห้ามตั้ง completed_at
            completed_at  = CASE WHEN $3::varchar = 'done' THEN now() ELSE NULL END,
            updated_at    = now()
      WHERE org_id = $1 AND id = $2
      RETURNING id`,
    [orgId, id, statusType]
  )
  return rows[0] ? await getCard(orgId, id) : null
}

/**
 * ตั้ง/ถอดเจ้าภาพ — สถานะขยับตามให้เอง ทั้ง 2 ทาง
 *
 * ⭐ กติกาเดียวกับ setCardStatus/createCard: "backlog = รอทำ ยังไม่มีเจ้าภาพ"
 *    - ตั้งเจ้าภาพให้การ์ดที่อยู่ backlog → ต้องขยับเป็น doing
 *      (ไม่งั้นได้ "รอทำ + มีเจ้าภาพ" = สภาพขัดกันเองแบบ bug-406 · ไม่โผล่ทั้งกอง "ยังไม่มีคนรับ"
 *       เพราะกรอง owner IS NULL และก็ไม่ควรอยู่กอง "ต้องส่ง")
 *    - ถอดเจ้าภาพ → ต้องกลับ backlog + ล้าง completed_at ไม่งั้นชน DB CHECK
 *    บังคับที่นี่ที่เดียว ไม่ใช่ที่ route — ทุกทางเข้า (เว็บ/บอท/cron) ต้องได้กติกาเดียวกัน
 */
export async function setCardOwner(orgId, id, ownerUserId) {
  // ⚠️ cast $3 ให้ชัด — พารามิเตอร์ตัวเดียวถูกใช้ทั้งค่าที่เซ็ตและเงื่อนไขใน CASE (42P08 แบบเดียวกับ setCardStatus)
  const { rows } = await pool.query(
    `UPDATE kanban_cards
        SET owner_user_id = $3::int,
            status_type = CASE
              WHEN $3::int IS NULL           THEN 'backlog'
              WHEN status_type = 'backlog'   THEN 'doing'
              ELSE status_type END,
            completed_at = CASE WHEN $3::int IS NULL THEN NULL ELSE completed_at END,
            updated_at = now()
      WHERE org_id = $1 AND id = $2 RETURNING id`,
    [orgId, id, ownerUserId]
  )
  return rows[0] ? await getCard(orgId, id) : null
}

/**
 * เก็บเข้ากรุ — โมดูลนี้ **ไม่มี hard delete เลย** ข้อมูลอยู่ครบเสมอ
 *
 * ⭐ "กรุ" = archive (`archived_at`) · คนละเรื่องกับช่อง **"พักไว้"** (`status_type='cancelled'`)
 *    พักไว้ = ยังจะทำ แต่ไม่ใช่ตอนนี้ → ยังเห็นเป็นกองบนหน้า /kanban
 *    กรุ    = ไม่เอาแล้ว/สร้างผิด → หายจากทุกกอง ไปโผล่ในโหมด "แสดง: กรุ" และเอากลับมาได้
 *    (คำเคยแปะสลับกันจนงง — user แก้ 2026-08-18 · ห้ามสลับกลับ)
 */
export async function archiveCard(orgId, id) {
  const { rows } = await pool.query(
    `UPDATE kanban_cards SET archived_at = now(), updated_at = now()
      WHERE org_id = $1 AND id = $2 AND archived_at IS NULL RETURNING id`,
    [orgId, id]
  )
  return Boolean(rows[0])
}

/** เอาออกจากกรุ — การ์ดกลับไปอยู่กองเดิม (status_type ไม่เคยถูกแตะตอนเข้ากรุ) */
export async function unarchiveCard(orgId, id) {
  const { rows } = await pool.query(
    `UPDATE kanban_cards SET archived_at = NULL, updated_at = now()
      WHERE org_id = $1 AND id = $2 AND archived_at IS NOT NULL RETURNING id`,
    [orgId, id]
  )
  return Boolean(rows[0])
}

/**
 * ลบการ์ดถาวร — ลบได้เลย ไม่ต้องเข้ากรุก่อน (ลอกแบบ posts)
 *
 * ⛔ ตัวเดียวในโมดูลที่ทำ DELETE บน kanban_cards · ด่านคือ canPurge() = admin เท่านั้น
 *    ด่านกันพลาดคือกล่องยืนยันที่แยกปุ่ม "เก็บเข้ากรุ" กับ "ลบถาวร" ออกจากกันชัดเจน
 * ⚠️ ห้ามเอาไปผูกกับปุ่ม "เก็บเข้ากรุ" เด็ดขาด — commit 37dd5e6 เคยพลาดแบบนั้นมาแล้ว
 *    (ปุ่มเขียน "เก็บเข้ากรุ" แต่ทำงานเป็นลบถาวร = โกหกผู้ใช้)
 *    ตารางลูกครบ 4 ตัวเป็น ON DELETE CASCADE (ตรวจกับ information_schema แล้ว 2026-08-18):
 *    kanban_card_labels · kanban_card_field_values · kanban_card_checklist · kanban_card_helpers
 *    → หายตามหมด ไม่ต้องกวาดเอง (โมดูลนี้ยังไม่มีตารางคอมเมนต์)
 */
export async function deleteCard(orgId, id) {
  const { rows } = await pool.query(
    `DELETE FROM kanban_cards WHERE org_id = $1 AND id = $2 RETURNING id`,
    [orgId, id]
  )
  return Boolean(rows[0])
}

// ── คนช่วย ──────────────────────────────────────────────────────────

export async function addHelper(orgId, cardId, userId) {
  await pool.query(
    `INSERT INTO kanban_card_helpers (card_id, user_id)
     SELECT $2, $3 FROM kanban_cards c WHERE c.org_id = $1 AND c.id = $2
     ON CONFLICT DO NOTHING`,
    [orgId, cardId, userId]
  )
  return await getCard(orgId, cardId)
}

export async function removeHelper(orgId, cardId, userId) {
  await pool.query(
    `DELETE FROM kanban_card_helpers h
      USING kanban_cards c
      WHERE h.card_id = c.id AND c.org_id = $1 AND h.card_id = $2 AND h.user_id = $3`,
    [orgId, cardId, userId]
  )
  return await getCard(orgId, cardId)
}

// งานย่อย (checklist) ย้ายไป db/kanban/fields.js แล้ว — ผูกกับ field_id ไม่ใช่ card_id เฉยๆ อีกต่อไป
// (checklist กลายเป็น custom field ชนิดหนึ่ง 2026-08-18 รอบเย็น ดู md/kanban/CUSTOM-FIELDS.md §กลับคำ)

/**
 * นับการ์ดสำหรับหน้าแรก — **นับอย่างเดียว ห้ามดึงการ์ดมา .length**
 *
 * ทำไมต้องมีตัวนี้ทั้งที่ listMyCards/listCards มีอยู่แล้ว (2026-08-30):
 *   สองตัวนั้น SELECT COLS + AGG = json_agg 4 subquery ต่อแถว การ์ดใบละ ~1.5KB
 *   หน้าแรกโดนทุก request ของทุกคน → เอามาแค่จำนวนไม่คุ้มเลย
 *
 * ⚠️ ต้องใช้ visibleLinkSql + LIVE_STATUS_SQL ชุดเดียวกับ list* เสมอ
 *    ไม่งั้นตัวเลขบนหน้าแรกจะไม่ตรงกับที่กดเข้าไปเห็นจริงที่ /kanban
 * ⚠️ viewer มาจาก kanbanViewer() ใน lib/kanbanGuard.js เท่านั้น — ไม่ส่ง = fail-closed
 */
export async function countMyOpenCards(orgId, userId, viewer = NO_VIEWER) {
  if (!userId) return { total: 0, overdue: 0, dueSoon: 0, backlog: 0, doing: 0 }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE c.due_at IS NOT NULL AND c.due_at < now())::int AS overdue,
            COUNT(*) FILTER (WHERE c.due_at >= now() AND c.due_at < now() + interval '7 days')::int AS due_soon,
            -- แยกตามสถานะสดด้วย (การ์ดที่ผูกเคส/โพสต์ใช้สถานะของต้นทาง ไม่ใช่คอลัมน์ cache)
            COUNT(*) FILTER (WHERE ${LIVE_STATUS_SQL} = 'backlog')::int AS backlog,
            COUNT(*) FILTER (WHERE ${LIVE_STATUS_SQL} = 'doing')::int   AS doing
       FROM kanban_cards c
      WHERE c.org_id = $1
        AND c.archived_at IS NULL
        AND ${visibleLinkSql(3, 4, 5)}
        AND ${LIVE_STATUS_SQL} NOT IN ('done','cancelled')
        AND (c.owner_user_id = $2 OR EXISTS (
              SELECT 1 FROM kanban_card_helpers h WHERE h.card_id = c.id AND h.user_id = $2))`,
    [orgId, userId, ...viewerParams(viewer)]
  )
  const r = rows[0] || {}
  return {
    total: r.total || 0, overdue: r.overdue || 0, dueSoon: r.due_soon || 0,
    backlog: r.backlog || 0, doing: r.doing || 0,
  }
}

