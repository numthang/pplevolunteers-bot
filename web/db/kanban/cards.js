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

// ป้ายเวลาที่ใช้เป็น optimistic lock token — ต้องเป็น "สตริงเดียวกันเป๊ะ" ทั้งตอนอ่านและตอนเทียบ
// (ห้ามส่ง Date ของ JS ไป-กลับ: PG เก็บ microsecond แต่ JS มีแค่ millisecond → เทียบไม่มีวันตรง)
const LOCK = `to_char(c.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

const DISPLAY_NAME = `COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.firstname, u.lastname)), ''), u.username)`

const COLS = `
  c.id, c.org_id, c.ref_no, c.title, c.detail, c.status_type,
  c.owner_user_id, c.due_at, c.priority, c.blocked, c.blocked_reason,
  c.created_by, c.created_at, c.updated_at, c.completed_at, c.archived_at,
  ${LOCK} AS lock_token`

// คนช่วย + งานย่อย ดึงมาด้วยเสมอ — การ์ดใบเดียวไม่มีทางใหญ่พอให้ต้อง lazy load
const AGG = `
  COALESCE((SELECT json_agg(json_build_object('user_id', h.user_id, 'name', ${DISPLAY_NAME}) ORDER BY h.joined_at)
              FROM kanban_card_helpers h JOIN users u ON u.id = h.user_id
             WHERE h.card_id = c.id), '[]'::json) AS helpers,
  COALESCE((SELECT count(*) FROM kanban_card_checklist k WHERE k.card_id = c.id), 0)                  AS checklist_total,
  COALESCE((SELECT count(*) FROM kanban_card_checklist k WHERE k.card_id = c.id AND k.done), 0)       AS checklist_done`

const OWNER = `(SELECT ${DISPLAY_NAME} FROM users u WHERE u.id = c.owner_user_id) AS owner_name`

/** helper_ids แบนๆ ให้ kanbanAccess.isCardStakeholder ใช้ได้ตรงๆ */
function shape(row) {
  if (!row) return null
  const helpers = row.helpers || []
  return { ...row, helpers, helper_ids: helpers.map(h => h.user_id) }
}

/** การ์ดใบเดียว — org_id อยู่ใน WHERE เสมอ กัน cross-org read */
export async function getCard(orgId, id) {
  const { rows } = await pool.query(
    `SELECT ${COLS}, ${OWNER}, ${AGG} FROM kanban_cards c WHERE c.org_id = $1 AND c.id = $2`,
    [orgId, id]
  )
  return shape(rows[0])
}

/** หาด้วยเลขที่คนพิมพ์ในดิสฯ (K-42) — ref_no ไม่ซ้ำใน org เดียวกัน */
export async function getCardByRef(orgId, refNo) {
  const { rows } = await pool.query(
    `SELECT ${COLS}, ${OWNER}, ${AGG} FROM kanban_cards c WHERE c.org_id = $1 AND c.ref_no = $2`,
    [orgId, refNo]
  )
  return shape(rows[0])
}

/**
 * หน้าแรก "การบ้านของฉัน" — คืน 2 กองแยกกัน (ดีไซน์ §Views)
 *   mine    = งานที่ฉันต้องส่ง (เจ้าภาพ)
 *   helping = งานที่ฉันช่วย
 * เรียงตามกำหนดส่ง · งานที่ไม่มีกำหนดส่งไปท้ายสุด · งานที่จบแล้วไม่เอา
 */
export async function listMyCards(orgId, userId, { includeClosed = false } = {}) {
  const closed = includeClosed ? '' : `AND c.status_type NOT IN ('done','cancelled')`
  const { rows } = await pool.query(
    `SELECT ${COLS}, ${OWNER}, ${AGG},
            (c.owner_user_id = $2) AS is_owner
       FROM kanban_cards c
      WHERE c.org_id = $1
        AND c.archived_at IS NULL
        ${closed}
        AND (c.owner_user_id = $2 OR EXISTS (
              SELECT 1 FROM kanban_card_helpers h WHERE h.card_id = c.id AND h.user_id = $2))
      ORDER BY (c.due_at IS NULL), c.due_at ASC, c.priority DESC, c.created_at ASC`,
    [orgId, userId]
  )
  const all = rows.map(shape)
  return {
    mine:    all.filter(r => r.is_owner),
    helping: all.filter(r => !r.is_owner),
  }
}

/** งานทั้ง org — ก้อน 1 ใช้กับแท็บ "งานที่ยังไม่มีคนรับ" + หน้ารวม */
export async function listCards(orgId, { status = null, ownerUserId = null, unassigned = false, includeArchived = false, includeClosed = true, limit = 200 } = {}) {
  const params = [orgId]
  let where = `c.org_id = $1`
  if (!includeArchived) where += ` AND c.archived_at IS NULL`
  if (!includeClosed)   where += ` AND c.status_type NOT IN ('done','cancelled')`
  if (status)           { params.push(status);      where += ` AND c.status_type = $${params.length}` }
  if (ownerUserId)      { params.push(ownerUserId); where += ` AND c.owner_user_id = $${params.length}` }
  if (unassigned)       where += ` AND c.owner_user_id IS NULL`
  params.push(limit)

  const { rows } = await pool.query(
    `SELECT ${COLS}, ${OWNER}, ${AGG}
       FROM kanban_cards c
      WHERE ${where}
      ORDER BY (c.due_at IS NULL), c.due_at ASC, c.priority DESC, c.created_at DESC
      LIMIT $${params.length}`,
    params
  )
  return rows.map(shape)
}

/**
 * สร้างการบ้าน — จอง ref_no ต่อ org
 *
 * ⚠️ หน้า Create มีปุ่มบันทึก ห้าม autosave (CLAUDE.md 2026-07-30)
 *    → ห้ามมีใครเรียกฟังก์ชันนี้ตอนกดปุ่ม "เพิ่มการบ้าน" เพื่อเปิดฟอร์มเปล่า
 *      (เคสจริงที่เคยพลาด: /posts กด "เขียนโพสต์ใหม่" แล้ว POST ทันที = ร่างเปล่าค้าง DB)
 */
export async function createCard(orgId, { title, detail = null, ownerUserId = null, dueAt = null, priority = 0, statusType = null }, createdBy) {
  // ไม่มีเจ้าภาพ = อยู่ backlog เท่านั้น (DB มี CHECK กันอีกชั้น — ที่นี่กันไม่ให้ยิงไปแล้วพัง)
  const status = statusType || (ownerUserId ? 'doing' : 'backlog')

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { rows } = await pool.query(
        `INSERT INTO kanban_cards (org_id, ref_no, title, detail, status_type, owner_user_id, due_at, priority, created_by)
         VALUES ($1,
                 (SELECT COALESCE(MAX(ref_no), 0) + 1 FROM kanban_cards WHERE org_id = $1),
                 $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [orgId, title, detail, status, ownerUserId, dueAt || null, priority, createdBy]
      )
      return await getCard(orgId, rows[0].id)
    } catch (e) {
      // 23505 = unique_violation → อีกคนคว้า ref_no นี้ไปก่อน ลองใหม่
      if (e.code === '23505' && attempt < 4) continue
      throw e
    }
  }
}

const EDITABLE = {
  title:          'title',
  detail:         'detail',
  due_at:         'due_at',        // ⚠️ ส่งดิบ ห้ามแปลง timezone
  priority:       'priority',
  blocked:        'blocked',
  blocked_reason: 'blocked_reason',
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
  const { rows } = await pool.query(
    `UPDATE kanban_cards
        SET status_type  = $3::varchar,
            completed_at = CASE WHEN $3::varchar IN ('done','cancelled') THEN now() ELSE NULL END,
            updated_at   = now()
      WHERE org_id = $1 AND id = $2
      RETURNING id`,
    [orgId, id, statusType]
  )
  return rows[0] ? await getCard(orgId, id) : null
}

/** ตั้ง/ถอดเจ้าภาพ · ถอดเจ้าภาพออกจากงานที่ไม่ได้อยู่ backlog ไม่ได้ (DB CHECK จะเตะ) */
export async function setCardOwner(orgId, id, ownerUserId) {
  const { rows } = await pool.query(
    `UPDATE kanban_cards SET owner_user_id = $3, updated_at = now()
      WHERE org_id = $1 AND id = $2 RETURNING id`,
    [orgId, id, ownerUserId]
  )
  return rows[0] ? await getCard(orgId, id) : null
}

/** เก็บเข้ากรุ (soft delete) — โมดูลนี้ไม่มี hard delete */
export async function archiveCard(orgId, id) {
  const { rows } = await pool.query(
    `UPDATE kanban_cards SET archived_at = now(), updated_at = now()
      WHERE org_id = $1 AND id = $2 AND archived_at IS NULL RETURNING id`,
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

// ── งานย่อย (checklist) ─────────────────────────────────────────────

export async function listChecklist(orgId, cardId) {
  const { rows } = await pool.query(
    `SELECT k.id, k.text, k.done, k.sort_order
       FROM kanban_card_checklist k JOIN kanban_cards c ON c.id = k.card_id
      WHERE c.org_id = $1 AND k.card_id = $2
      ORDER BY k.sort_order, k.id`,
    [orgId, cardId]
  )
  return rows
}

export async function addChecklistItem(orgId, cardId, text) {
  const { rows } = await pool.query(
    `INSERT INTO kanban_card_checklist (card_id, text, sort_order)
     SELECT $2, $3, COALESCE((SELECT MAX(sort_order) + 1 FROM kanban_card_checklist WHERE card_id = $2), 0)
       FROM kanban_cards c WHERE c.org_id = $1 AND c.id = $2
     RETURNING id, text, done, sort_order`,
    [orgId, cardId, text]
  )
  return rows[0] || null
}

export async function setChecklistDone(orgId, itemId, done) {
  const { rows } = await pool.query(
    `UPDATE kanban_card_checklist k SET done = $3
       FROM kanban_cards c
      WHERE k.card_id = c.id AND c.org_id = $1 AND k.id = $2
      RETURNING k.id, k.text, k.done, k.sort_order`,
    [orgId, itemId, done]
  )
  return rows[0] || null
}

export async function deleteChecklistItem(orgId, itemId) {
  const { rows } = await pool.query(
    `DELETE FROM kanban_card_checklist k
      USING kanban_cards c
      WHERE k.card_id = c.id AND c.org_id = $1 AND k.id = $2
      RETURNING k.id`,
    [orgId, itemId]
  )
  return Boolean(rows[0])
}
