import { describe, it, expect } from 'vitest'
import { sortCardsBy, collectSortableFields, BUILTIN_SORT_FIELDS } from '../kanbanSort.js'

const at = (iso) => new Date(iso).toISOString()

const card = (over = {}) => ({
  id: 1,
  title: 'z',
  detail: null,
  status_type: 'doing',
  due_at: null,
  updated_at: at('2026-08-01T00:00:00+07:00'),
  created_at: at('2026-08-01T00:00:00+07:00'),
  fields: [],
  ...over,
})

describe('sortCardsBy', () => {
  it('spec ว่าง → เหมือน sortCards ค่าเริ่มต้น (กำหนดส่ง)', () => {
    const cards = [
      card({ id: 1, due_at: null }),
      card({ id: 2, due_at: at('2026-08-19T09:00:00+07:00') }),
    ]
    expect(sortCardsBy(cards, null).map((c) => c.id)).toEqual([2, 1])
  })

  it('เรียงตาม updated_at ล่าสุดขึ้นก่อน (dir desc)', () => {
    const cards = [
      card({ id: 1, updated_at: at('2026-08-01T00:00:00+07:00') }),
      card({ id: 2, updated_at: at('2026-08-20T00:00:00+07:00') }),
      card({ id: 3, updated_at: at('2026-08-10T00:00:00+07:00') }),
    ]
    const sorted = sortCardsBy(cards, { key: 'updated_at', type: 'date', dir: 'desc' })
    expect(sorted.map((c) => c.id)).toEqual([2, 3, 1])
  })

  it('เรียงตามชื่อ (text) asc — ไทยใช้ localeCompare', () => {
    const cards = [card({ id: 1, title: 'ข' }), card({ id: 2, title: 'ก' })]
    const sorted = sortCardsBy(cards, { key: 'title', type: 'text', dir: 'asc' })
    expect(sorted.map((c) => c.id)).toEqual([2, 1])
  })

  it('ค่าว่างไปท้ายเสมอ ไม่ว่า asc หรือ desc', () => {
    const cards = [card({ id: 1, title: null }), card({ id: 2, title: 'ก' })]
    expect(sortCardsBy(cards, { key: 'title', type: 'text', dir: 'asc' }).map((c) => c.id)).toEqual([2, 1])
    expect(sortCardsBy(cards, { key: 'title', type: 'text', dir: 'desc' }).map((c) => c.id)).toEqual([2, 1])
  })

  it('เรียงตาม custom field ชนิด number (fieldId)', () => {
    const cards = [
      card({ id: 1, fields: [{ field_id: 9, key: 'budget', label: 'งบประมาณ', type: 'number', value: 500 }] }),
      card({ id: 2, fields: [{ field_id: 9, key: 'budget', label: 'งบประมาณ', type: 'number', value: 2000 }] }),
    ]
    const sorted = sortCardsBy(cards, { key: 'field_9', fieldId: 9, type: 'number', dir: 'desc' })
    expect(sorted.map((c) => c.id)).toEqual([2, 1])
  })

  it('เรียงตาม custom field ชนิด checklist — % เสร็จน้อยไปมาก', () => {
    const cards = [
      card({ id: 1, fields: [{ field_id: 5, type: 'checklist', value: [{ done: true }, { done: false }] }] }), // 50%
      card({ id: 2, fields: [{ field_id: 5, type: 'checklist', value: [{ done: true }, { done: true }] }] }),  // 100%
    ]
    const sorted = sortCardsBy(cards, { key: 'field_5', fieldId: 5, type: 'checklist', dir: 'asc' })
    expect(sorted.map((c) => c.id)).toEqual([1, 2])
  })

  it('ไม่แก้ array เดิม', () => {
    const cards = [card({ id: 1, title: 'ข' }), card({ id: 2, title: 'ก' })]
    const copy = [...cards]
    sortCardsBy(cards, { key: 'title', type: 'text', dir: 'asc' })
    expect(cards).toEqual(copy)
  })
})

describe('collectSortableFields', () => {
  it('เก็บ field ที่มีอยู่จริงบนการ์ด ไม่ซ้ำ id', () => {
    const cards = [
      card({ fields: [{ field_id: 1, key: 'area', label: 'อำเภอ', type: 'select', value: [] }] }),
      card({ fields: [{ field_id: 1, key: 'area', label: 'อำเภอ', type: 'select', value: [] }] }),
      card({ fields: [{ field_id: 2, key: 'budget', label: 'งบประมาณ', type: 'number', value: null }] }),
    ]
    expect(collectSortableFields(cards).map((f) => f.field_id).sort()).toEqual([1, 2])
  })
})

describe('BUILTIN_SORT_FIELDS', () => {
  it('มี due_at เป็นตัวแรก (ตรงกับลำดับค่าเริ่มต้นเดิม)', () => {
    expect(BUILTIN_SORT_FIELDS[0].key).toBe('due_at')
  })
})
