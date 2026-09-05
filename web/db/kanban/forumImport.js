// web/db/kanban/forumImport.js — ตารางพักของหน้าคัดกระทู้เข้า KANBAN
//
// ai_*  = ข้อเสนอของ AI (สคริปต์ scripts/kanban/prepForumImport.mjs เขียน)
// pick_* = ค่าที่คนเคาะเอง — **ห้ามให้สคริปต์ AI เขียนทับ** (รัน --refresh ได้โดยของที่แก้ไว้ไม่หาย)
//
// ค่าที่ใช้จริงตอนนำเข้า = pick_ ?? ai_ ?? ค่าตั้งต้น — ประกอบที่ effective() ที่เดียว
import pool from '../index.js'

/**
 * "มีคนแตะใบนี้แล้ว" — คิดจาก pick_* ล้วนๆ ไม่มีปุ่ม "ตรวจแล้ว" ให้กดเพิ่ม (user เคาะ 2026-09-05)
 * ⚠️ เพิ่ม pick_* ตัวใหม่เมื่อไหร่ ต้องมาต่อเงื่อนไขตรงนี้ด้วย ไม่งั้นใบที่แก้ช่องนั้นจะไม่ขึ้นป้าย
 */
const EDITED_SQL = `(i.pick_title IS NOT NULL OR i.pick_detail IS NOT NULL OR i.pick_workstreams IS NOT NULL
      OR i.pick_areas IS NOT NULL OR i.pick_assignees IS NOT NULL OR i.pick_status IS NOT NULL
      OR i.pick_event_date IS NOT NULL OR i.pick_no_event_date)`

const LIST_SQL = `
  SELECT i.id, i.thread_id, i.channel_id, i.title, i.url, i.thread_created_at,
         i.first_message, i.message_count, i.image_count, i.participants,
         i.ai_summary, i.ai_is_project, i.ai_reason, i.ai_workstreams, i.ai_areas,
         i.ai_assignee_user_id, i.ai_at,
         -- ⚠️ คืน DATE เป็น "ข้อความ" เสมอ — ปล่อยให้ node-pg แปลงเป็น Date object จะกลายเป็น
         --    เที่ยงคืนเวลาไทย แล้วพอ .toISOString() ฝั่งเว็บ (UTC) วันจะถอยไป 1 วันทันที
         --    (บั๊กเดียวกับ txn_at ของ finance ที่เขียนเตือนไว้ใน CLAUDE.md)
         to_char(i.ai_event_date,   'YYYY-MM-DD') AS ai_event_date,
         to_char(i.pick_event_date, 'YYYY-MM-DD') AS pick_event_date,
         i.pick_title, i.pick_detail, i.pick_workstreams, i.pick_areas, i.pick_assignee_user_id,
         i.pick_no_event_date, i.pick_assignees, i.pick_status,
         i.status, i.card_id, i.dup_card_id, i.dup_score,
         i.author_user_id, i.author_discord_id,
         i.touched_at, i.touched_by, ${EDITED_SQL} AS edited,
         COALESCE(au.username, au.firstname) AS author_name,
         COALESCE(tu.username, tu.firstname) AS touched_name,
         COALESCE(iu.username, iu.firstname) AS ai_assignee_name,
         d.title AS dup_title, d.ref_no AS dup_ref_no
    FROM kanban_forum_import i
    LEFT JOIN users au ON au.id = i.author_user_id
    LEFT JOIN users iu ON iu.id = i.ai_assignee_user_id
    LEFT JOIN users tu ON tu.id = i.touched_by
    LEFT JOIN kanban_cards d ON d.id = i.dup_card_id
   WHERE i.org_id = $1`

/**
 * รายการให้คัด — **ใบที่มีคนแก้แล้วลอยขึ้นบนสุดเสมอ** (หลายมือช่วยกันคัด คนกดนำเข้าต้องเห็นก่อน)
 * รองลงมาเรียง "AI ว่าเป็นงานจริง" แล้วค่อยตามวันที่ใหม่สุด
 */
export async function listImportRows(orgId, { status = 'pending', channelId = null, editedOnly = false } = {}) {
  const params = [orgId]
  let sql = LIST_SQL
  if (status !== 'all') { params.push(status); sql += ` AND i.status = $${params.length}` }
  if (channelId) { params.push(channelId); sql += ` AND i.channel_id = $${params.length}` }
  if (editedOnly) sql += ` AND ${EDITED_SQL}`
  sql += ` ORDER BY edited DESC, i.ai_is_project DESC NULLS LAST, i.thread_created_at DESC`
  const { rows } = await pool.query(sql, params)
  return rows
}

export async function getImportRow(orgId, id) {
  const { rows } = await pool.query(`${LIST_SQL} AND i.id = $2`, [orgId, id])
  return rows[0] ?? null
}

/** นับตามสถานะ — ไว้โชว์ตัวเลขบนแท็บ · `edited` = ใบที่รอคัดและมีคนแก้ไว้แล้ว (ตัวเลขบนชิปกรอง) */
export async function countByStatus(orgId) {
  const { rows } = await pool.query(
    `SELECT i.status, count(*)::int AS n,
            count(*) FILTER (WHERE ${EDITED_SQL})::int AS edited
       FROM kanban_forum_import i WHERE i.org_id = $1 GROUP BY i.status`, [orgId]
  )
  const out = Object.fromEntries(rows.map((r) => [r.status, r.n]))
  out.edited = rows.find((r) => r.status === 'pending')?.edited ?? 0
  return out
}

/** ค่าที่จะใช้จริงตอนสร้างการ์ด — คนเคาะชนะ AI เสมอ */
export function effective(row) {
  return {
    title: (row.pick_title ?? row.title ?? '').trim(),
    detail: row.pick_detail ?? row.ai_summary ?? row.first_message ?? null,
    workstreams: row.pick_workstreams ?? row.ai_workstreams ?? [],
    areas: row.pick_areas ?? row.ai_areas ?? [],
    // ⚠️ pick_no_* คือ "คนดูแล้วและตั้งใจให้ว่าง" — ต่างจาก NULL ที่แปลว่า "ยังไม่แตะ ใช้ของ AI ไปก่อน"
    //    ไม่มี 2 สถานะนี้แยกกัน = คนล้างค่าทิ้งแล้วค่าที่ AI เดาเด้งกลับมาเงียบๆ
    // หลายคนได้ (kanban_card_assignees เท่ากันหมด ไม่มีเจ้าภาพ) · [] = ตั้งใจไม่มีใคร · null = ใช้ที่ AI เดา
    assigneeIds: (row.pick_assignees ?? (row.ai_assignee_user_id ? [row.ai_assignee_user_id] : []))
      .map(Number).filter(Boolean),
    // วันจัดงาน = ทั้ง due_at และ completed_at (user เคาะ 2026-09-04) · ไม่มี = completed_at ใช้วันตั้งกระทู้
    eventDate: row.pick_no_event_date ? null : (row.pick_event_date ?? row.ai_event_date ?? null),
    // งานที่ยังไม่จบก็มีปนมา (user ทัก 2026-09-05) — ค่าตั้งต้นยังเป็น done เหมือนเดิม
    statusType: row.pick_status ?? 'done',
  }
}

const PICK_COLUMNS = {
  title: 'pick_title',
  detail: 'pick_detail',
  workstreams: 'pick_workstreams',
  areas: 'pick_areas',
  assignees: 'pick_assignees',
  statusType: 'pick_status',
  eventDate: 'pick_event_date',
  noEventDate: 'pick_no_event_date',
}

/**
 * บันทึกค่าที่คนแก้ (ทีละช่อง — หน้าเว็บเซฟทันทีตอนออกจากช่อง)
 * ⚠️ null = "กลับไปใช้ค่าที่ AI เดา" ไม่ใช่ "ค่าว่าง" — ช่องที่อยากให้ว่างจริงๆ ส่ง '' หรือ []
 */
export async function updatePick(orgId, id, patch = {}, userId = null) {
  const sets = []
  const params = [orgId, id]
  for (const [key, column] of Object.entries(PICK_COLUMNS)) {
    if (!(key in patch)) continue
    const value = patch[key]
    params.push(Array.isArray(value) ? JSON.stringify(value) : value)
    sets.push(`${column} = $${params.length}${Array.isArray(value) ? '::jsonb' : ''}`)
  }
  if (!sets.length) return getImportRow(orgId, id)

  // ป้าย "แก้แล้วโดย …" — คนล่าสุดชนะ (ไม่ใช่ audit log · ดู migration touched-by)
  params.push(userId ?? null)
  sets.push(`touched_by = $${params.length}::int`, 'touched_at = CURRENT_TIMESTAMP')

  await pool.query(
    `UPDATE kanban_forum_import SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE org_id = $1 AND id = $2`, params
  )
  return getImportRow(orgId, id)
}

/**
 * จองใบนี้ก่อนสร้างการ์ด — **กันการ์ดซ้ำเมื่อ 2 คนกดนำเข้าใบเดียวกันพร้อมกัน**
 *
 * ⛔ ห้ามกลับไปเป็น "อ่านมาเช็ค status แล้วค่อยสร้าง" — ระหว่างสร้างการ์ดมีการโหลดรูปจากดิสฯ
 *    ซึ่งกินเวลาเป็นวินาที ช่องว่างนั้นกว้างพอให้อีกคนอ่านเจอ status เดิมแล้วสร้างการ์ดใบที่ 2
 * คืน true = จองได้ (เราเป็นคนเดียวที่จะสร้าง) · false = คนอื่นชิงไปแล้ว ให้ข้ามใบนี้
 */
export async function claimForImport(orgId, id) {
  const { rowCount } = await pool.query(
    `UPDATE kanban_forum_import SET status = 'imported', updated_at = CURRENT_TIMESTAMP
      WHERE org_id = $1 AND id = $2 AND status <> 'imported'`, [orgId, id]
  )
  return rowCount === 1
}

/** คืนใบที่จองไว้ให้กลับเป็นสถานะเดิม — ใช้ตอนสร้างการ์ดพังกลางทาง ไม่งั้นใบนั้นค้างเป็น "นำเข้าแล้ว" ทั้งที่ไม่มีการ์ด */
export async function releaseClaim(orgId, id, status = 'pending') {
  await pool.query(
    `UPDATE kanban_forum_import SET status = $3, card_id = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE org_id = $1 AND id = $2 AND card_id IS NULL`, [orgId, id, status]
  )
}

/** ผูกการ์ดที่สร้างเสร็จเข้ากับใบที่จองไว้ (status ถูกตั้งเป็น imported ตั้งแต่ตอนจองแล้ว) */
export async function attachCard(orgId, id, cardId) {
  await pool.query(
    `UPDATE kanban_forum_import SET card_id = $3, updated_at = CURRENT_TIMESTAMP
      WHERE org_id = $1 AND id = $2`, [orgId, id, cardId]
  )
}

/** pending ⇄ skipped (กด "ไม่เอา" / เอากลับมา) — imported เปลี่ยนที่นี่ไม่ได้ ต้องผ่านตัวสร้างการ์ด */
export async function setStatus(orgId, id, status, userId = null) {
  if (!['pending', 'skipped'].includes(status)) return null
  await pool.query(
    `UPDATE kanban_forum_import SET status = $3, touched_by = $4::int,
            touched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE org_id = $1 AND id = $2 AND status <> 'imported'`, [orgId, id, status, userId ?? null]
  )
  return getImportRow(orgId, id)
}
