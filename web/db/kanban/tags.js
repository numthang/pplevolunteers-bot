/**
 * tags.js — "แท็ก" ของการบ้าน = **ตัวเลือกใน custom field** ไม่ใช่ตารางป้ายอีกต่อไป
 *
 * ⭐ แทนที่ `db/kanban/labels.js` ที่ถูกยุบทิ้ง 2026-08-19 (user เคาะ: ป้ายกับ custom field
 *   เก็บของความหมายเดียวกัน 2 ที่ → ก่อน import การ์ดเก่าอีก 82 ใบ ต้องเหลือที่เดียว)
 *
 * ⛔ **ห้ามอ้าง field ด้วย id หรือ key** — key มาจาก `slugifyFieldKey(label, id)` = ผูกกับ id ที่เครื่องนั้นสร้าง
 *    dev กับ prod ได้คนละเลขแน่นอน · resolve ด้วย **ชื่อ (org_id + label)** เสมอ
 *
 * ที่นี่คือ **จุดเขียนแท็กจุดเดียวของระบบ** — สคริปต์ import และสคริปต์ย้ายข้อมูลเรียกตัวเดียวกันนี้
 * เขียน SQL ซ้ำที่อื่นเมื่อไหร่ = 2 ทางเขียนที่ดริฟต์ออกจากกัน (บทเรียนจากตะเข็บตะกร้าสื่อ)
 */

import pool from '../index.js'
import { createFieldDef } from './fields.js'

/** ชนิดที่เก็บแท็กเป็น "ค่าใน field" (array ของ option id) */
const OPTION_TYPES = ['select', 'multi_select']
/** ชนิดที่เก็บเป็น "แถวจริง" ทีละรายการ */
const ROW_TYPES = ['checklist']

export const ACCEPTS_TAGS = [...OPTION_TYPES, ...ROW_TYPES]

/**
 * หา field จากชื่อ — ไม่มีก็สร้างให้
 *
 * ⚠️ สร้างผ่าน `createFieldDef()` เท่านั้น ห้าม INSERT เอง — key มาจาก `slugifyFieldKey(label, id)`
 *    เขียน key เองที่นี่เมื่อไหร่ = field ที่สคริปต์สร้างกับที่ UI สร้างมี key คนละสูตร
 *
 * @param {string} type ชนิดที่จะใช้ถ้าต้องสร้างใหม่ (ของเดิมที่มีอยู่แล้วไม่ถูกเปลี่ยนชนิด)
 * @returns {{id, key, label, type, created: boolean}}
 */
export async function ensureField(orgId, name, type = 'multi_select') {
  const label = String(name || '').trim()
  if (!label) throw new Error('ensureField: ต้องมีชื่อ field')

  const { rows } = await pool.query(
    `SELECT id, key, label, type FROM kanban_field_defs
      WHERE org_id = $1 AND label = $2 AND archived_at IS NULL ORDER BY id LIMIT 1`,
    [orgId, label]
  )
  if (rows[0]) return { ...rows[0], created: false }

  const made = await createFieldDef(orgId, { label, type })
  return { ...made, created: true }
}

/** ทางลัดเดิม — แท็กเลือกได้หลายอันโดยธรรมชาติ เลยตั้งต้นเป็น multi_select */
export const ensureTagField = (orgId, name) => ensureField(orgId, name, 'multi_select')

/**
 * ตัวเลือก 1 อันใน field — จับคู่ด้วยชื่อ (มี unique index บน field_id+name)
 * @param {string|null} color ใส่มาเมื่อย้ายของเก่าที่มีสีอยู่แล้ว · null = ให้ DB/UI คิดเอง
 */
export async function ensureTagOption(fieldId, name, { color = null, archivedAt = null } = {}) {
  const clean = String(name || '').trim()
  if (!clean) return null

  const { rows } = await pool.query(
    `INSERT INTO kanban_field_options (field_id, name, color, sort_order, archived_at)
     VALUES ($1, $2, $3,
             (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM kanban_field_options WHERE field_id = $1), $4)
     ON CONFLICT (field_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name, color, (xmax = 0) AS created`,
    [fieldId, clean, color, archivedAt]
  )
  return rows[0]
}

/** ทางลัดที่สคริปต์ import ใช้: ชื่อกลุ่ม + ชื่อแท็ก → พร้อมแปะการ์ด */
export async function ensureTag(orgId, groupName, name) {
  const field = await ensureTagField(orgId, groupName)
  const option = await ensureTagOption(field.id, name)
  return option ? { fieldId: field.id, optionId: option.id, type: field.type } : null
}

/**
 * แปะแท็กลงการ์ด — **เพิ่มเข้าไป ไม่ทับของเดิม**
 *
 * ⚠️ ต่างจาก `setCardLabels()` ตัวเก่าที่เขียนทับทั้งชุด — ที่นี่ union เพราะการ์ดอาจถูกกรอก field
 *    เดียวกันด้วยมือไปแล้ว การ import ไม่ควรลบของที่คนกรอกเอง
 * ⚠️ checklist เป็นแถวจริง → NOT EXISTS กันรันซ้ำแล้วงอก (multi_select เป็น set เลยไม่มีปัญหานี้)
 *
 * @param {{fieldId, optionId, type}[]} tags
 */
export async function addCardTags(orgId, cardId, tags = []) {
  if (!tags.length) return { values: 0, items: 0 }

  const byField = new Map()
  for (const tg of tags) {
    if (!tg) continue
    const k = String(tg.fieldId)
    if (!byField.has(k)) byField.set(k, { type: tg.type, ids: [] })
    byField.get(k).ids.push(tg.optionId)
  }

  // การ์ดต้องอยู่ใน org นี้จริง — ไม่งั้นเขียนข้าม org ได้ (ตารางลูกไม่มี org_id ของตัวเอง)
  const { rows: own } = await pool.query(
    `SELECT id FROM kanban_cards WHERE org_id = $1 AND id = $2`, [orgId, cardId])
  if (!own[0]) return { values: 0, items: 0 }

  let values = 0, items = 0
  for (const [fieldId, { type, ids }] of byField) {
    if (OPTION_TYPES.includes(type)) {
      await pool.query(
        `INSERT INTO kanban_card_field_values (card_id, field_id, value_options)
         VALUES ($1, $2, $3::bigint[])
         ON CONFLICT (card_id, field_id) DO UPDATE
           SET value_options = (
             SELECT ARRAY(SELECT DISTINCT unnest(
               COALESCE(kanban_card_field_values.value_options, '{}'::bigint[]) || EXCLUDED.value_options))
           )`,
        [cardId, fieldId, ids]
      )
      values++
    } else if (ROW_TYPES.includes(type)) {
      for (const optId of ids) {
        const { rowCount } = await pool.query(
          `INSERT INTO kanban_card_checklist (card_id, field_id, option_id, done, sort_order)
           SELECT $1, $2, $3, FALSE,
                  (SELECT COALESCE(MAX(sort_order), -1) + 1
                     FROM kanban_card_checklist WHERE card_id = $1 AND field_id = $2)
            WHERE NOT EXISTS (
              SELECT 1 FROM kanban_card_checklist
               WHERE card_id = $1 AND field_id = $2 AND option_id = $3)`,
          [cardId, fieldId, optId]
        )
        items += rowCount
      }
    }
    // ชนิดอื่น (text/number/date/checkbox/url) รับแท็กไม่ได้ — ตัวเรียกต้องกรองมาก่อน
  }
  return { values, items }
}
