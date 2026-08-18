// web/db/kanban/fields.js — custom field ของการบ้าน (ก้อน 2: 5 ชนิดสเกลาร์)
//
// ดีไซน์: md/kanban/CUSTOM-FIELDS.md — คนละกลไกกับ kanban_labels (labels.js)
//   field = ช่องข้อมูลที่ org ตั้งเอง (admin คุม) · ป้าย = คำศัพท์กลาง (ทุกคนสร้างได้)
//
// ⚠️ เขียนค่า field ห้าม UPDATE kanban_cards เด็ดขาด — จะไปขยับ updated_at ที่เป็น lock token
//    ของ autosave ช่องพิมพ์ ทำให้คนที่เปิดการ์ดค้างอยู่โดน 409 ฟรี (บทเรียนเดียวกับ labels/checklist)
import pool from '../index.js'
import { FIELD_TYPE_COLUMN } from '../../lib/kanbanFieldValue.js'

/** defs ที่ยังไม่ถูกซ่อน (หรือรวมที่ซ่อนถ้า includeArchived) เรียงตามลำดับที่ตั้งไว้ */
export async function listFieldDefs(orgId, { includeArchived = false } = {}) {
  const { rows } = await pool.query(
    `SELECT id, board_id, key, label, help_text, type, type_options, sort_order, archived_at
       FROM kanban_field_defs
      WHERE org_id = $1 ${includeArchived ? '' : 'AND archived_at IS NULL'}
      ORDER BY sort_order, id`,
    [orgId]
  )
  return rows
}

/** สำหรับหน้าจัดการ (admin) — รวมที่ซ่อนไว้ + จำนวนการ์ดที่กรอกค่าไว้แล้ว */
export async function listFieldDefsWithCounts(orgId) {
  const { rows } = await pool.query(
    `SELECT d.id, d.board_id, d.key, d.label, d.help_text, d.type, d.sort_order, d.archived_at,
            COUNT(v.card_id)::int AS value_count
       FROM kanban_field_defs d
       LEFT JOIN kanban_card_field_values v ON v.field_id = d.id
      WHERE d.org_id = $1
      GROUP BY d.id
      ORDER BY (d.archived_at IS NOT NULL), d.sort_order, d.id`,
    [orgId]
  )
  return rows
}

/** field เดียว (ยังไม่ถูกซ่อน) — ใช้ก่อนเขียนค่าเพื่อรู้ type จริง */
export async function getFieldDef(orgId, fieldId) {
  const { rows } = await pool.query(
    `SELECT id, key, label, type FROM kanban_field_defs WHERE org_id = $1 AND id = $2 AND archived_at IS NULL`,
    [orgId, fieldId]
  )
  return rows[0] || null
}

/**
 * สร้าง field def ใหม่ — admin เท่านั้น (คุมที่ route)
 * @returns {{ok:true, def}|{ok:false, duplicate:true}}
 */
export async function createFieldDef(orgId, { key, label, helpText = null, type }) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO kanban_field_defs (org_id, key, label, help_text, type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, key, label, help_text, type, sort_order, archived_at`,
      [orgId, key, label, helpText, type]
    )
    return { ok: true, def: rows[0] }
  } catch (e) {
    // 23505 = uq_kanban_field_defs_key — key ซ้ำใน org/board เดียวกัน
    if (e.code === '23505') return { ok: false, duplicate: true }
    throw e
  }
}

/**
 * แก้ label/help_text — key และ type เปลี่ยนไม่ได้ (ไม่รับพารามิเตอร์เข้ามาด้วยซ้ำ กันแก้ผิดที่)
 * @returns {{ok:true, def}|{ok:false, notFound:true}}
 */
export async function updateFieldDef(orgId, fieldId, { label, helpText } = {}) {
  const { rows: cur } = await pool.query(
    `SELECT id, label, help_text FROM kanban_field_defs WHERE org_id = $1 AND id = $2`,
    [orgId, fieldId]
  )
  if (!cur[0]) return { ok: false, notFound: true }

  const nextLabel = label === undefined ? cur[0].label : String(label).trim()
  const nextHelp  = helpText === undefined ? cur[0].help_text : (String(helpText || '').trim() || null)

  const { rows } = await pool.query(
    `UPDATE kanban_field_defs SET label = $3, help_text = $4
      WHERE org_id = $1 AND id = $2
      RETURNING id, key, label, help_text, type, sort_order, archived_at`,
    [orgId, fieldId, nextLabel, nextHelp]
  )
  return { ok: true, def: rows[0] }
}

/** ซ่อน field (ไม่ลบ) — ค่าที่การ์ดกรอกไว้แล้วยังอยู่ครบ แค่ไม่โผล่ในกล่องเลือก/ฟอร์มอีก */
export async function archiveFieldDef(orgId, fieldId) {
  const { rows } = await pool.query(
    `UPDATE kanban_field_defs SET archived_at = now()
      WHERE org_id = $1 AND id = $2 AND archived_at IS NULL RETURNING id`,
    [orgId, fieldId]
  )
  return Boolean(rows[0])
}

/** เลิกซ่อน — ค่าเดิมที่การ์ดกรอกไว้กลับมาโผล่ทันที (ไม่เคยหายไปจากตาราง) */
export async function unarchiveFieldDef(orgId, fieldId) {
  const { rows } = await pool.query(
    `UPDATE kanban_field_defs SET archived_at = NULL
      WHERE org_id = $1 AND id = $2 AND archived_at IS NOT NULL RETURNING id`,
    [orgId, fieldId]
  )
  return Boolean(rows[0])
}

/**
 * เขียนค่า field ของการ์ด 1 ใบ — value ต้องผ่าน validateFieldValue() มาก่อนแล้ว (route เป็นคนตรวจ)
 * value === null → ลบแถวทิ้ง (นับจำนวนกรอกแล้วให้ถูก) · ยกเว้น checkbox ที่ไม่มี null (false ก็ upsert เหมือนกัน)
 * @returns {{ok:true}|{notFound:true}}
 */
export async function setCardFieldValue(orgId, cardId, fieldId, type, value) {
  const column = FIELD_TYPE_COLUMN[type]
  if (!column) return { notFound: true }

  // ยืนยันการ์ดเป็นของ org นี้จริง — กันเขียนข้าม tenant ด้วย id ที่เดาเอา
  const { rows: card } = await pool.query(
    `SELECT id FROM kanban_cards WHERE org_id = $1 AND id = $2`, [orgId, cardId]
  )
  if (!card[0]) return { notFound: true }

  if (value === null) {
    await pool.query(
      `DELETE FROM kanban_card_field_values WHERE card_id = $1 AND field_id = $2`,
      [cardId, fieldId]
    )
    return { ok: true }
  }

  await pool.query(
    `INSERT INTO kanban_card_field_values (card_id, field_id, ${column})
     VALUES ($1, $2, $3)
     ON CONFLICT (card_id, field_id) DO UPDATE SET ${column} = EXCLUDED.${column}`,
    [cardId, fieldId, value]
  )
  return { ok: true }
}
