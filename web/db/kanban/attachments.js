// web/db/kanban/attachments.js — ไฟล์แนบของการ์ด KANBAN
//
// bytes อยู่บนดิสก์ (web/lib/kanbanUploads.js) · ตารางนี้เก็บแค่ metadata
//
// ⚠️ เขียน/ลบไฟล์แนบ **ห้าม UPDATE kanban_cards** — updated_at เป็น lock token ของ autosave
//    ช่องพิมพ์ ขยับเมื่อไหร่คนที่เปิดการ์ดค้างอยู่โดน 409 ฟรี (กติกาเดียวกับ fields.js/checklist)
//
// ⭐ field_id: NULL = ไฟล์แนบประจำการ์ด · มีค่า = ของ custom field ชนิด upload (ยังไม่มีชนิดนั้น
//    — คอลัมน์รอไว้ ดู migration 1788538100000)
import pool from '../index.js'

const COLS = `id, card_id, field_id, file_path, original_name, mime,
              discord_attachment_id, discord_message_id, sort_order, created_by, created_at`

/** ไฟล์แนบของการ์ด 1 ใบ (เฉพาะของประจำการ์ด = field_id IS NULL) */
export async function listCardAttachments(orgId, cardId) {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM kanban_card_attachments
      WHERE org_id = $1 AND card_id = $2 AND field_id IS NULL
      ORDER BY sort_order, id`,
    [orgId, cardId]
  )
  return rows
}

/** ไฟล์แนบ 1 ตัว — org_id อยู่ใน WHERE เสมอ (กันอ่านข้าม tenant ด้วย id ที่เดาได้) */
export async function getAttachment(orgId, attId) {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM kanban_card_attachments WHERE org_id = $1 AND id = $2`,
    [orgId, attId]
  )
  return rows[0] ?? null
}

export async function countCardAttachments(orgId, cardId) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM kanban_card_attachments
      WHERE org_id = $1 AND card_id = $2 AND field_id IS NULL`,
    [orgId, cardId]
  )
  return rows[0].n
}

/**
 * เพิ่มไฟล์แนบ 1 ตัว
 *
 * ⭐ ON CONFLICT (discord_attachment_id) DO NOTHING = หัวใจของการ "รัน import ซ้ำได้"
 *    รูปเดิมจากกระทู้เดิมจะไม่เข้าซ้ำ แม้สคริปต์จะรันกี่รอบ (คืน null = มีอยู่แล้ว)
 * @returns {Promise<object|null>} แถวที่เพิ่ม · null ถ้าเป็นรูปเดิมที่เคยเข้าแล้ว
 */
export async function insertAttachment(orgId, cardId, {
  file_path, original_name = null, mime = null, field_id = null,
  discord_attachment_id = null, discord_message_id = null,
  sort_order = 0, created_by = null,
}) {
  const { rows } = await pool.query(
    `INSERT INTO kanban_card_attachments
       (card_id, org_id, field_id, file_path, original_name, mime,
        discord_attachment_id, discord_message_id, sort_order, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (discord_attachment_id) WHERE discord_attachment_id IS NOT NULL DO NOTHING
     RETURNING ${COLS}`,
    [cardId, orgId, field_id, file_path, original_name, mime,
     discord_attachment_id, discord_message_id, sort_order, created_by]
  )
  return rows[0] ?? null
}

/** ลบแถว → คืน file_path ให้คนเรียกไปลบไฟล์จริงต่อ (DB เป็นความจริง ดิสก์ตามทีหลัง) */
export async function deleteAttachment(orgId, attId) {
  const { rows } = await pool.query(
    `DELETE FROM kanban_card_attachments WHERE org_id = $1 AND id = $2 RETURNING file_path`,
    [orgId, attId]
  )
  return rows[0]?.file_path ?? null
}

/**
 * path ของไฟล์ทั้งหมดในการ์ด — เรียก **ก่อน** ลบการ์ดถาวร
 * (แถวหายเองด้วย ON DELETE CASCADE แต่ไฟล์บนดิสก์ไม่มีใครตามลบ — บทเรียนเดียวกับ cases.js:585)
 */
export async function listCardFilePaths(orgId, cardId) {
  const { rows } = await pool.query(
    `SELECT file_path FROM kanban_card_attachments WHERE org_id = $1 AND card_id = $2`,
    [orgId, cardId]
  )
  return rows.map((r) => r.file_path)
}
