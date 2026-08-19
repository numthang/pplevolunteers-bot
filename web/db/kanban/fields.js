// web/db/kanban/fields.js — custom field ของการบ้าน (text/number/url/date/checkbox/select/multi_select/checklist)
//
// ดีไซน์: md/kanban/CUSTOM-FIELDS.md §กลับคำ
//
// ✅ **ป้ายถูกยุบเข้ามาแล้ว 2026-08-19** (3 กลุ่ม / 29 ป้าย / 86 เส้น → ตกหล่น 0)
//    กลุ่มป้าย = field · ป้ายในกลุ่ม = options · `kanban_labels`/`kanban_card_labels` ไม่มีโค้ดอ่านแล้ว
//    3 อย่างที่ป้ายเคยทำได้อย่างเดียว ตอนนี้ field ทำได้หมด:
//    กรองบน /kanban (lib/kanbanTagFilter.js) · ชิปบนการ์ด (cardTags()) · สิทธิ์ (ไม่มี gate โดยตั้งใจ ดูข้างล่าง)
//    ⛔ ห้ามเขียนโค้ดใหม่ที่อ่าน/เขียนตารางป้ายอีก — รอ DROP อยู่
//
// ⛔ ไม่มี admin gate ในไฟล์นี้เลย (เคาะ 2026-08-18 รอบเย็น) — ทุกอย่างสร้าง/แก้/ซ่อนได้จากในการ์ด
//    ที่กำลังแก้อยู่แล้ว (route เช็คแค่ canEditCard) ไม่มีหน้า "จัดการช่องข้อมูล" แยกต่างหากอีกต่อไป
//
// ⚠️ เขียนค่า field ห้าม UPDATE kanban_cards เด็ดขาด — จะไปขยับ updated_at ที่เป็น lock token
//    ของ autosave ช่องพิมพ์ ทำให้คนที่เปิดการ์ดค้างอยู่โดน 409 ฟรี (บทเรียนเดียวกับ labels/checklist เดิม)
import pool from '../index.js'
import { FIELD_TYPE_COLUMN, slugifyFieldKey } from '../../lib/kanbanFieldValue.js'
import { autoColor } from '../../lib/kanbanLabelColors.js'

// ── field defs ───────────────────────────────────────────────────────

/** defs ที่ยังไม่ถูกซ่อน (หรือรวมที่ซ่อนถ้า includeArchived) เรียงตามลำดับที่ตั้งไว้ */
export async function listFieldDefs(orgId, { includeArchived = false } = {}) {
  const { rows } = await pool.query(
    `SELECT id, board_id, key, label, help_text, type, sort_order, archived_at
       FROM kanban_field_defs
      WHERE org_id = $1 ${includeArchived ? '' : 'AND archived_at IS NULL'}
      ORDER BY sort_order, id`,
    [orgId]
  )
  return rows
}

/** จำนวนการ์ดที่กรอกค่าไว้แล้ว — ให้ UI เตือนก่อนซ่อน field (แนวเดียวกับ countCardsWithLabel) */
export async function countCardsWithFieldValue(orgId, fieldId) {
  const { rows } = await pool.query(
    `SELECT count(DISTINCT v.card_id)::int AS n
       FROM kanban_card_field_values v
       JOIN kanban_cards c ON c.id = v.card_id
      WHERE c.org_id = $1 AND v.field_id = $2`,
    [orgId, fieldId]
  )
  return rows[0].n
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
 * สร้าง field def ใหม่ — key สร้างอัตโนมัติจาก label (คนไม่ต้องพิมพ์เอง)
 * pre-fetch nextval ก่อน insert เพื่อเอา id มาต่อท้าย key กันชนกันเองโดยไม่ต้อง retry loop
 */
export async function createFieldDef(orgId, { label, helpText = null, type }) {
  const { rows: idRow } = await pool.query(
    `SELECT nextval(pg_get_serial_sequence('kanban_field_defs', 'id')) AS id`
  )
  const id = idRow[0].id
  const key = slugifyFieldKey(label, id)

  // ⚠️ ต้องตั้ง sort_order = MAX+1 เอง — DEFAULT เป็น 0 ทำให้ field ใหม่ทุกอันไปแทรกกลางตาราง
  //    (ORDER BY sort_order, id → กองที่ sort_order=0 ลอยขึ้นบนหมด) เจอตอนสร้าง "งบประมาณ" 2026-08-19
  const { rows } = await pool.query(
    `INSERT INTO kanban_field_defs (id, org_id, key, label, help_text, type, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6,
             (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM kanban_field_defs WHERE org_id = $2))
     RETURNING id, key, label, help_text, type, sort_order, archived_at`,
    [id, orgId, key, label, helpText, type]
  )
  return rows[0]
}

/** แก้ label/help_text — key และ type เปลี่ยนไม่ได้ (ไม่รับพารามิเตอร์นี้เข้ามาด้วยซ้ำ กันแก้ผิดที่) */
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

/** ซ่อน field (ไม่ลบ) — ค่าที่การ์ดกรอกไว้แล้วยังอยู่ครบ แค่ไม่โผล่ในกล่องข้อมูลของทีมอีก */
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
 * นับความเสียหายก่อนลบ field ถาวร — เอาไปเติมตัวเลขในกล่องยืนยัน
 * ⛔ ห้ามถามว่า "แน่ใจไหม" ลอยๆ — ตัวเลขจริงคือกลไกกันพลาดหลัก แทนการจำกัดสิทธิ์ (ดีไซน์ §A4)
 */
export async function countFieldImpact(orgId, fieldId) {
  const { rows } = await pool.query(
    `SELECT (SELECT count(*) FROM kanban_card_field_values v
               JOIN kanban_cards c ON c.id = v.card_id
              WHERE v.field_id = $2 AND c.org_id = $1)          AS cards,
            (SELECT count(*) FROM kanban_field_options
              WHERE field_id = $2)                              AS options,
            (SELECT count(*) FROM kanban_card_checklist ci
               JOIN kanban_cards c ON c.id = ci.card_id
              WHERE ci.field_id = $2 AND c.org_id = $1)         AS checklist_items`,
    [orgId, fieldId]
  )
  const r = rows[0]
  return { cards: Number(r.cards), options: Number(r.options), checklistItems: Number(r.checklist_items) }
}

/**
 * ลบ field ถาวร — ลบได้เลย ไม่ต้องซ่อนก่อน (ลอกแบบ posts: ปุ่ม "ลบ" เดียว แล้วเลือกในกล่องว่าซ่อนหรือลบถาวร)
 *
 * ด่านกันพลาดคือ **กล่องยืนยันที่บอกจำนวนจริง + ปุ่มลบถาวรแยกจากปุ่มซ่อน** ไม่ใช่การบังคับ 2 จังหวะ
 * FK 3 ตัวเป็น ON DELETE CASCADE อยู่แล้ว (card_field_values · card_checklist · field_options)
 * → ค่าที่การ์ดกรอกไว้หายตามหมด ไม่ต้องกวาดเอง แต่ต้องบอกจำนวนก่อนถาม (countFieldImpact)
 */
export async function deleteFieldDef(orgId, fieldId) {
  const { rows } = await pool.query(
    `DELETE FROM kanban_field_defs WHERE org_id = $1 AND id = $2 RETURNING id`,
    [orgId, fieldId]
  )
  return Boolean(rows[0])
}

// ── ค่าของการ์ด (scalar + select/multi_select) ─────────────────────────

/**
 * เขียนค่า field ของการ์ด 1 ใบ — value ต้องผ่าน validateFieldValue() มาก่อนแล้ว (route เป็นคนตรวจ)
 * value === null → ลบแถวทิ้ง · checkbox ไม่มี null (false ก็ upsert เหมือนกัน) · select/multi_select เป็น array
 */
export async function setCardFieldValue(orgId, cardId, fieldId, type, value) {
  const column = FIELD_TYPE_COLUMN[type]
  if (!column) return { notFound: true }

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

// ── ตัวเลือกของ select/multi_select ─────────────────────────────────────
// ผูกกับ field เดียว (ต่างจาก kanban_labels ที่เป็นคำศัพท์กลางทั้ง org) — จัดการทั้งหมดจากใน combobox ของการ์ด

/** ตัวเลือกทั้งหมดของ field นี้ (ที่ยังไม่ซ่อน) เรียงตามลำดับที่จัดไว้ */
export async function listFieldOptions(fieldId) {
  const { rows } = await pool.query(
    `SELECT id, name, color, sort_order, archived_at FROM kanban_field_options
      WHERE field_id = $1 AND archived_at IS NULL
      ORDER BY sort_order, id`,
    [fieldId]
  )
  return rows
}

/**
 * หาตัวเลือกเดิม หรือสร้างใหม่ถ้ายังไม่มี (พิมพ์ในกล่องแล้ว "สร้างตัวเลือกใหม่") — แนวเดียวกับ labels.ensureLabel
 * sort_order ต่อท้ายสุดของ field นั้นเสมอ
 */
export async function ensureFieldOption(fieldId, name) {
  const clean = String(name || '').trim()
  if (!clean) return null

  const find = async () => {
    const { rows } = await pool.query(
      `SELECT id, name, color FROM kanban_field_options WHERE field_id = $1 AND name = $2`,
      [fieldId, clean]
    )
    return rows[0] || null
  }

  const found = await find()
  if (found) return found

  try {
    const { rows } = await pool.query(
      `INSERT INTO kanban_field_options (field_id, name, color, sort_order)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM kanban_field_options WHERE field_id = $1))
       RETURNING id, name, color`,
      [fieldId, clean, autoColor({ name: clean, group: `field:${fieldId}` })]
    )
    return rows[0]
  } catch (e) {
    if (e.code === '23505') return await find()   // อีกคนพิมพ์ชื่อเดียวกันพร้อมกัน
    throw e
  }
}

/** แก้ชื่อ/สีตัวเลือก */
export async function updateFieldOption(fieldId, optionId, { name, color } = {}) {
  const { rows: cur } = await pool.query(
    `SELECT id, name, color FROM kanban_field_options WHERE field_id = $1 AND id = $2`,
    [fieldId, optionId]
  )
  if (!cur[0]) return { ok: false, notFound: true }

  const nextName = name === undefined ? cur[0].name : String(name).trim()
  if (!nextName) return { ok: false, notFound: true }
  const nextColor = color === undefined ? cur[0].color : (color || null)

  try {
    const { rows } = await pool.query(
      `UPDATE kanban_field_options SET name = $3, color = $4
        WHERE field_id = $1 AND id = $2
        RETURNING id, name, color, sort_order, archived_at`,
      [fieldId, optionId, nextName, nextColor]
    )
    return { ok: true, option: rows[0] }
  } catch (e) {
    if (e.code === '23505') return { ok: false, duplicate: true }
    throw e
  }
}

/**
 * นับว่าตัวเลือกนี้ถูกใช้อยู่กี่การ์ด — เอาไปเติมตัวเลขในกล่องยืนยันก่อนลบ
 * (select/multi_select นับจาก value_options · checklist นับจากแถวใน kanban_card_checklist)
 */
export async function countOptionUsage(fieldId, optionId) {
  const { rows } = await pool.query(
    `SELECT (SELECT count(*) FROM kanban_card_field_values
              WHERE field_id = $1 AND $2 = ANY(value_options))      AS picked,
            (SELECT count(*) FROM kanban_card_checklist
              WHERE option_id = $2)                                 AS checklist`,
    [fieldId, optionId]
  )
  return { picked: Number(rows[0].picked), checklist: Number(rows[0].checklist) }
}

/**
 * ลบตัวเลือกถาวร (ปุ่ม "ลบ" ในกล่อง) — **ลบจริง ไม่ใช่ซ่อน** (กลับคำ 2026-08-18)
 *
 * เดิมเป็น archiveFieldOption() ด้วยเหตุผล "กันการ์ดที่เลือกไว้แล้วข้อมูลหายเงียบ"
 * แต่เหตุผลนั้นใช้ไม่ได้จริง — cards.js มี `AND o.archived_at IS NULL` ใน JOIN อยู่แล้ว
 * → ซ่อนก็ทำให้ชิปหายจากทุกการ์ดทันทีเหมือนกัน ได้แค่ทิ้งแถวตาย + id ค้างในอาร์เรย์
 *
 * ⚠️ value_options เป็น BIGINT[] **ไม่ใช่ FK** → ต้องกวาดเองใน transaction เดียวกัน
 *    ลำดับสำคัญ: คัดชื่อลง checklist.text ก่อน ไม่งั้น ON DELETE SET NULL ทิ้งบรรทัดว่างไว้
 */
export async function deleteFieldOption(fieldId, optionId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1) เก็บชื่อไว้ในแถว checklist ก่อน — รายการที่ติ๊กไว้ต้องไม่กลายเป็นบรรทัดว่าง
    //
    // ⛔ **ห้ามใส่ `ci.field_id = $1` เป็นเงื่อนไขร่วม** — เคยพลาดมาแล้ว 2026-08-18:
    //    ถ้าแถวเช็คลิสต์อ้าง option ของ field อื่น เงื่อนไขนี้ไม่แมตช์ → ไม่ได้คัดชื่อ
    //    แล้ว FK ON DELETE SET NULL เข้ามาล้าง option_id ทีหลัง = ได้บรรทัดว่างเปล่า
    //    option_id เป็น id ที่ unique ทั้งตารางอยู่แล้ว กรองด้วยตัวมันตัวเดียวถูกต้องและปลอดภัยกว่า
    await client.query(
      `UPDATE kanban_card_checklist ci
          SET text = COALESCE(ci.text, o.name), option_id = NULL
         FROM kanban_field_options o
        WHERE o.id = $1 AND ci.option_id = $1`,
      [optionId]
    )

    // 2) ถอน id ออกจากอาร์เรย์ของทุกการ์ด (select/multi_select)
    await client.query(
      `UPDATE kanban_card_field_values
          SET value_options = array_remove(value_options, $2::bigint)
        WHERE field_id = $1 AND $2 = ANY(value_options)`,
      [fieldId, optionId]
    )

    // 3) ค่อยลบตัวเลือกจริง
    const { rows } = await client.query(
      `DELETE FROM kanban_field_options WHERE field_id = $1 AND id = $2 RETURNING id`,
      [fieldId, optionId]
    )

    await client.query('COMMIT')
    return Boolean(rows[0])
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/** ลากจัดลำดับใหม่ในกล่อง — orderedIds คือลำดับเต็มของตัวเลือกที่ยังไม่ซ่อนทั้งหมด */
export async function reorderFieldOptions(fieldId, orderedIds) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        `UPDATE kanban_field_options SET sort_order = $3 WHERE field_id = $1 AND id = $2`,
        [fieldId, orderedIds[i], i]
      )
    }
    await client.query('COMMIT')
    return true
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/**
 * จัดลำดับ field ใหม่ (ปุ่มขึ้น/ลงในกล่องข้อมูลของทีม)
 * orderedIds = ลำดับเต็มของ field ที่ยังไม่ถูกซ่อนทั้งหมด — แนวเดียวกับ reorderFieldOptions
 * ⚠️ org_id อยู่ใน WHERE ทุกแถว — กันยิง id ข้าม tenant มาสลับลำดับของคนอื่น
 */
export async function reorderFieldDefs(orgId, orderedIds) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        `UPDATE kanban_field_defs SET sort_order = $3 WHERE org_id = $1 AND id = $2`,
        [orgId, orderedIds[i], i]
      )
    }
    await client.query('COMMIT')
    return true
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

// ── เช็คลิสต์ (custom field ชนิด checklist) ─────────────────────────────
// ผูกกับ (card_id, field_id) คู่กัน — การ์ดเดียวมีได้หลายเช็คลิสต์ถ้า org สร้างหลาย field ชนิดนี้

/** item ของเช็คลิสต์ field นี้บนการ์ดใบนี้ */
/**
 * รายการในเช็คลิสต์ 1 field
 * ⚠️ ชื่อที่โชว์ = `COALESCE(o.name, i.text)` — รายการที่ผูกกับคลัง (option_id) ต้องเปลี่ยนชื่อตามคลัง
 *    ส่วน text ใช้เมื่อ option ถูกลบ (deleteFieldOption คัดชื่อลง text ให้แล้ว) หรือของเก่าก่อนมีคลัง
 */
export async function listChecklistItems(orgId, cardId, fieldId) {
  const { rows } = await pool.query(
    `SELECT i.id, COALESCE(o.name, i.text) AS text, i.option_id, i.done, i.sort_order
       FROM kanban_card_checklist i
       JOIN kanban_cards c ON c.id = i.card_id
       LEFT JOIN kanban_field_options o ON o.id = i.option_id
      WHERE c.org_id = $1 AND i.card_id = $2 AND i.field_id = $3
      ORDER BY i.sort_order, i.id`,
    [orgId, cardId, fieldId]
  )
  return rows
}

/**
 * เพิ่มรายการในเช็คลิสต์ — ผูกกับคลัง (optionId) หรือเป็นข้อความลอย (text) อย่างใดอย่างหนึ่ง
 * ปกติ route จะ ensureFieldOption() ให้ก่อนแล้วส่ง optionId มา (เหมือน multi_select)
 * text เหลือไว้สำหรับของเก่า/กรณีที่ไม่อยากลงคลัง
 */
export async function addChecklistItem(orgId, cardId, fieldId, { text = null, optionId = null }) {
  const { rows } = await pool.query(
    `INSERT INTO kanban_card_checklist (card_id, field_id, text, option_id, sort_order)
     SELECT c.id, $3, $4, $5,
            (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM kanban_card_checklist WHERE card_id = c.id AND field_id = $3)
       FROM kanban_cards c WHERE c.org_id = $1 AND c.id = $2
     RETURNING id, option_id, done, sort_order,
               COALESCE((SELECT name FROM kanban_field_options WHERE id = $5), text) AS text`,
    [orgId, cardId, fieldId, text, optionId]
  )
  return rows[0] || null
}

export async function setChecklistItemDone(orgId, itemId, done) {
  const { rows } = await pool.query(
    `UPDATE kanban_card_checklist i SET done = $3
       FROM kanban_cards c
      WHERE i.card_id = c.id AND c.org_id = $1 AND i.id = $2
      RETURNING i.id, i.option_id, i.done, i.sort_order,
                COALESCE((SELECT name FROM kanban_field_options WHERE id = i.option_id), i.text) AS text`,
    [orgId, itemId, done]
  )
  return rows[0] || null
}

/**
 * แก้ข้อความงานย่อย — **เฉพาะการ์ดใบนี้** (user เคาะ 2026-08-19)
 *
 * ⭐ ไม่ได้ rename ตัวเลือกในคลัง — ชี้ item ไปที่ตัวเลือก "ชื่อใหม่" แทน (route ensureFieldOption ให้ก่อน)
 *    ชื่อเก่ายังอยู่ในคลัง การ์ดใบอื่นที่ใช้อยู่จึงไม่สะเทือน
 *    (ต่างจาก multi_select ที่แก้ชิป = rename ตัวเลือกทั้งระบบ — คนละเจตนากัน จงใจให้ต่าง)
 *
 * ⚠️ ผูก i.field_id = $3 ไว้ด้วย — กันส่ง itemId ของ field อื่นมาให้ชี้ option ข้าม field
 */
export async function setChecklistItemText(orgId, itemId, fieldId, { optionId = null, text = null }) {
  const { rows } = await pool.query(
    `UPDATE kanban_card_checklist i SET option_id = $4, text = $5
       FROM kanban_cards c
      WHERE i.card_id = c.id AND c.org_id = $1 AND i.id = $2 AND i.field_id = $3
      RETURNING i.id, i.option_id, i.done, i.sort_order,
                COALESCE((SELECT name FROM kanban_field_options WHERE id = i.option_id), i.text) AS text`,
    [orgId, itemId, fieldId, optionId, text]
  )
  return rows[0] || null
}

export async function deleteChecklistItem(orgId, itemId) {
  const { rows } = await pool.query(
    `DELETE FROM kanban_card_checklist i
       USING kanban_cards c
      WHERE i.card_id = c.id AND c.org_id = $1 AND i.id = $2
      RETURNING i.id`,
    [orgId, itemId]
  )
  return Boolean(rows[0])
}

/** ลากจัดลำดับ item ใหม่ */
export async function reorderChecklistItems(orgId, cardId, fieldId, orderedIds) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: card } = await client.query(
      `SELECT id FROM kanban_cards WHERE org_id = $1 AND id = $2`, [orgId, cardId]
    )
    if (!card[0]) { await client.query('ROLLBACK'); return false }
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        `UPDATE kanban_card_checklist SET sort_order = $4
          WHERE card_id = $1 AND field_id = $2 AND id = $3`,
        [cardId, fieldId, orderedIds[i], i]
      )
    }
    await client.query('COMMIT')
    return true
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}
