// web/db/kanban/forumImport.js — ตารางพักของหน้าคัดกระทู้เข้า KANBAN
//
// ai_*  = ข้อเสนอของ AI (สคริปต์ scripts/kanban/prepForumImport.mjs เขียน)
// pick_* = ค่าที่คนเคาะเอง — **ห้ามให้สคริปต์ AI เขียนทับ** (รัน --refresh ได้โดยของที่แก้ไว้ไม่หาย)
//
// ค่าที่ใช้จริงตอนนำเข้า = pick_ ?? ai_ ?? ค่าตั้งต้น — ประกอบที่ effective() ที่เดียว
import pool from '../index.js'

const LIST_SQL = `
  SELECT i.id, i.thread_id, i.channel_id, i.title, i.url, i.thread_created_at,
         i.first_message, i.message_count, i.image_count, i.participants,
         i.ai_summary, i.ai_is_project, i.ai_reason, i.ai_workstreams, i.ai_areas,
         i.ai_assignee_user_id, i.ai_event_date, i.ai_at,
         i.pick_title, i.pick_detail, i.pick_workstreams, i.pick_areas, i.pick_assignee_user_id,
         i.status, i.card_id, i.dup_card_id, i.dup_score,
         i.author_user_id, i.author_discord_id,
         COALESCE(au.username, au.firstname) AS author_name,
         COALESCE(pu.username, pu.firstname) AS pick_assignee_name,
         COALESCE(iu.username, iu.firstname) AS ai_assignee_name,
         d.title AS dup_title, d.ref_no AS dup_ref_no
    FROM kanban_forum_import i
    LEFT JOIN users au ON au.id = i.author_user_id
    LEFT JOIN users pu ON pu.id = i.pick_assignee_user_id
    LEFT JOIN users iu ON iu.id = i.ai_assignee_user_id
    LEFT JOIN kanban_cards d ON d.id = i.dup_card_id
   WHERE i.org_id = $1`

/** รายการให้คัด — ตั้งต้นเรียง "AI ว่าเป็นงานจริง" ขึ้นก่อน แล้วค่อยตามวันที่ใหม่สุด */
export async function listImportRows(orgId, { status = 'pending', channelId = null } = {}) {
  const params = [orgId]
  let sql = LIST_SQL
  if (status !== 'all') { params.push(status); sql += ` AND i.status = $${params.length}` }
  if (channelId) { params.push(channelId); sql += ` AND i.channel_id = $${params.length}` }
  sql += ` ORDER BY i.ai_is_project DESC NULLS LAST, i.thread_created_at DESC`
  const { rows } = await pool.query(sql, params)
  return rows
}

export async function getImportRow(orgId, id) {
  const { rows } = await pool.query(`${LIST_SQL} AND i.id = $2`, [orgId, id])
  return rows[0] ?? null
}

/** นับตามสถานะ — ไว้โชว์ตัวเลขบนแท็บ */
export async function countByStatus(orgId) {
  const { rows } = await pool.query(
    `SELECT status, count(*)::int AS n FROM kanban_forum_import WHERE org_id = $1 GROUP BY status`, [orgId]
  )
  return Object.fromEntries(rows.map((r) => [r.status, r.n]))
}

/** ค่าที่จะใช้จริงตอนสร้างการ์ด — คนเคาะชนะ AI เสมอ */
export function effective(row) {
  return {
    title: (row.pick_title ?? row.title ?? '').trim(),
    detail: row.pick_detail ?? row.ai_summary ?? row.first_message ?? null,
    workstreams: row.pick_workstreams ?? row.ai_workstreams ?? [],
    areas: row.pick_areas ?? row.ai_areas ?? [],
    assigneeUserId: row.pick_assignee_user_id ?? row.ai_assignee_user_id ?? null,
    // วันจัดงาน = ทั้ง due_at และ completed_at (user เคาะ 2026-09-04) · ไม่มี = completed_at ใช้วันตั้งกระทู้
    eventDate: row.ai_event_date ?? null,
  }
}

const PICK_COLUMNS = {
  title: 'pick_title',
  detail: 'pick_detail',
  workstreams: 'pick_workstreams',
  areas: 'pick_areas',
  assigneeUserId: 'pick_assignee_user_id',
}

/**
 * บันทึกค่าที่คนแก้ (ทีละช่อง — หน้าเว็บเซฟทันทีตอนออกจากช่อง)
 * ⚠️ null = "กลับไปใช้ค่าที่ AI เดา" ไม่ใช่ "ค่าว่าง" — ช่องที่อยากให้ว่างจริงๆ ส่ง '' หรือ []
 */
export async function updatePick(orgId, id, patch = {}) {
  const sets = []
  const params = [orgId, id]
  for (const [key, column] of Object.entries(PICK_COLUMNS)) {
    if (!(key in patch)) continue
    const value = patch[key]
    params.push(Array.isArray(value) ? JSON.stringify(value) : value)
    sets.push(`${column} = $${params.length}${Array.isArray(value) ? '::jsonb' : ''}`)
  }
  if (!sets.length) return getImportRow(orgId, id)

  await pool.query(
    `UPDATE kanban_forum_import SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE org_id = $1 AND id = $2`, params
  )
  return getImportRow(orgId, id)
}

/** pending ⇄ skipped (กด "ไม่เอา" / เอากลับมา) — imported เปลี่ยนที่นี่ไม่ได้ ต้องผ่านตัวสร้างการ์ด */
export async function setStatus(orgId, id, status) {
  if (!['pending', 'skipped'].includes(status)) return null
  await pool.query(
    `UPDATE kanban_forum_import SET status = $3, updated_at = CURRENT_TIMESTAMP
      WHERE org_id = $1 AND id = $2 AND status <> 'imported'`, [orgId, id, status]
  )
  return getImportRow(orgId, id)
}
