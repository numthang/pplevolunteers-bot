/**
 * "เรียงตาม" ที่ผู้ใช้เลือกเอง — เมนู sort บน /kanban (แยกจาก sortCards ใน kanbanGrouping.js
 * ซึ่งเป็นลำดับ **ค่าเริ่มต้น** ตายตัวที่มีเทสอยู่แล้ว ห้ามแก้ signature นั้น)
 *
 * spec = null (หรือ key: null) → ใช้ sortCards ค่าเริ่มต้นเป๊ะ (กำหนดส่ง→ความสำคัญ→ใหม่ก่อน)
 * ยกเว้นกอง "เสร็จ" (doneMode) ที่ due_at ไม่มีความหมายแล้ว → ใช้ sortDoneCards แทน (เพิ่งปิดก่อน)
 */

import { sortCards, sortDoneCards } from './kanbanGrouping.js'
import { STATUS_TYPES } from './kanbanAccess.js'

/** field ในตัวการ์ดเอง (ไม่ใช่ custom field) ที่เรียงได้ */
export const BUILTIN_SORT_FIELDS = [
  { key: 'due_at', labelKey: 'sort.due', type: 'date' },
  { key: 'title', labelKey: 'sort.title', type: 'text' },
  { key: 'detail', labelKey: 'sort.description', type: 'text' },
  { key: 'status_type', labelKey: 'sort.status', type: 'status' },
  { key: 'updated_at', labelKey: 'sort.updated', type: 'date' },
  { key: 'created_at', labelKey: 'sort.created', type: 'date' },
]

function builtinValue(card, key) {
  if (key === 'status_type') return STATUS_TYPES.indexOf(card.status_type)
  return card[key]
}

/** ค่าของ custom field 1 ช่อง แปลงให้เทียบกันได้ตามชนิด */
function customValue(card, fieldId, type) {
  const f = (card.fields || []).find((f) => String(f.field_id) === String(fieldId))
  if (!f) return null
  switch (type) {
    case 'checklist': {
      const items = f.value || []
      return items.length ? items.filter((i) => i.done).length / items.length : null
    }
    case 'select':
      return f.value?.[0]?.name ?? null
    case 'multi_select':
      return (f.value || []).map((o) => o.name).sort().join(', ') || null
    case 'checkbox':
      return f.value ? 1 : 0
    default: // text, url, number, date
      return f.value ?? null
  }
}

/**
 * ทุก custom field ที่ "มีอยู่จริง" บนการ์ดที่โหลดมา — เหมือน collectFilterGroups ใน
 * kanbanTagFilter.js แต่ไม่กรอง type (ที่นี่เรียงได้ทุกชนิด ไม่ใช่แค่ select/multi_select)
 * @param {object[]} cards
 * @returns {{field_id, key, label, type}[]}
 */
export function collectSortableFields(cards = []) {
  const byId = new Map()
  for (const card of cards) {
    for (const f of card.fields || []) {
      const id = String(f.field_id)
      if (!byId.has(id)) byId.set(id, { field_id: f.field_id, key: f.key, label: f.label, type: f.type })
    }
  }
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label, 'th'))
}

function compareValues(av, bv, type) {
  if (type === 'date') return new Date(av).getTime() - new Date(bv).getTime()
  if (type === 'number' || type === 'checkbox' || type === 'checklist' || type === 'status') return av - bv
  return String(av).localeCompare(String(bv), 'th')
}

/**
 * เรียงตาม field ที่เลือกจากเมนู "เรียงลำดับ"
 * @param {object[]} cards
 * @param {{key: string, fieldId?: number|string, type: string, dir: 'asc'|'desc'}|null} spec
 *   fieldId มี = custom field, ไม่มี = builtin (ใช้ key ตรงกับคอลัมน์บนการ์ด)
 * @param {{doneMode?: boolean}} [opts] doneMode: true เมื่อ spec ว่าง ใช้ sortDoneCards แทน sortCards
 */
export function sortCardsBy(cards = [], spec, { doneMode = false } = {}) {
  if (!spec || !spec.key) return doneMode ? sortDoneCards(cards) : sortCards(cards)

  const getValue = spec.fieldId != null
    ? (c) => customValue(c, spec.fieldId, spec.type)
    : (c) => builtinValue(c, spec.key)
  const sign = spec.dir === 'desc' ? -1 : 1

  return [...cards].sort((a, b) => {
    const av = getValue(a)
    const bv = getValue(b)
    const aEmpty = av == null || av === ''
    const bEmpty = bv == null || bv === ''
    // ว่างไปท้ายเสมอ ไม่ว่าจะเรียง asc หรือ desc — ตัดสินก่อน sign เพื่อไม่ให้ desc พลิกไปท้ายกลับเป็นหัว
    if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1
    return compareValues(av, bv, spec.type) * sign
  })
}
