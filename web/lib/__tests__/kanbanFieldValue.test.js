import { describe, it, expect } from 'vitest'
import { validateFieldValue, isValidFieldKey, FIELD_TYPE_COLUMN, FIELD_TYPES } from '../kanbanFieldValue.js'

describe('validateFieldValue — text', () => {
  it('ตัดช่องว่างหัวท้าย', () => {
    expect(validateFieldValue('text', '  งบไม่พอ  ')).toEqual({ ok: true, value: 'งบไม่พอ' })
  })
  it('ค่าว่าง → null (ลบแถว)', () => {
    expect(validateFieldValue('text', '   ')).toEqual({ ok: true, value: null })
    expect(validateFieldValue('text', null)).toEqual({ ok: true, value: null })
  })
  it('ยาวเกิน 500 → error', () => {
    const res = validateFieldValue('text', 'ก'.repeat(501))
    expect(res.ok).toBe(false)
  })
})

describe('validateFieldValue — url', () => {
  it('รับ http/https', () => {
    expect(validateFieldValue('url', 'https://facebook.com/x')).toEqual({ ok: true, value: 'https://facebook.com/x' })
    expect(validateFieldValue('url', 'http://x.com')).toEqual({ ok: true, value: 'http://x.com' })
  })
  it('ไม่มี http(s):// → error', () => {
    expect(validateFieldValue('url', 'facebook.com/x').ok).toBe(false)
  })
  it('ว่าง → null', () => {
    expect(validateFieldValue('url', '')).toEqual({ ok: true, value: null })
  })
})

describe('validateFieldValue — number', () => {
  it('แปลงตัวเลขปกติ', () => {
    expect(validateFieldValue('number', '20000')).toEqual({ ok: true, value: 20000 })
  })
  it('รับ comma คั่นหลัก', () => {
    expect(validateFieldValue('number', '20,000.50')).toEqual({ ok: true, value: 20000.5 })
  })
  it('ไม่ใช่ตัวเลข → error', () => {
    expect(validateFieldValue('number', 'abc').ok).toBe(false)
  })
  it('ว่าง → null', () => {
    expect(validateFieldValue('number', '  ')).toEqual({ ok: true, value: null })
  })
})

describe('validateFieldValue — date', () => {
  it('รับ YYYY-MM-DD', () => {
    expect(validateFieldValue('date', '2026-08-20')).toEqual({ ok: true, value: '2026-08-20' })
  })
  it('รูปแบบอื่นไม่รับ', () => {
    expect(validateFieldValue('date', '20/08/2026').ok).toBe(false)
    expect(validateFieldValue('date', '2026-08-20T10:00').ok).toBe(false)
  })
  it('ว่าง → null', () => {
    expect(validateFieldValue('date', '')).toEqual({ ok: true, value: null })
  })
})

describe('validateFieldValue — checkbox', () => {
  it('ไม่มีค่าว่าง — false เป็นค่าจริง ไม่ใช่ลบ', () => {
    expect(validateFieldValue('checkbox', true)).toEqual({ ok: true, value: true })
    expect(validateFieldValue('checkbox', false)).toEqual({ ok: true, value: false })
    expect(validateFieldValue('checkbox', undefined)).toEqual({ ok: true, value: false })
  })
})

describe('validateFieldValue — ชนิดไม่รู้จัก', () => {
  it('คืน error ไม่ throw', () => {
    expect(validateFieldValue('select', 'x').ok).toBe(false)
  })
})

describe('FIELD_TYPE_COLUMN', () => {
  it('ครบทุกชนิดใน FIELD_TYPES', () => {
    for (const t of FIELD_TYPES) expect(FIELD_TYPE_COLUMN[t]).toBeTruthy()
  })
  it('text กับ url ใช้คอลัมน์เดียวกัน', () => {
    expect(FIELD_TYPE_COLUMN.text).toBe(FIELD_TYPE_COLUMN.url)
  })
})

describe('isValidFieldKey', () => {
  it('รับ snake_case ที่ขึ้นต้นด้วยตัวอักษร', () => {
    expect(isValidFieldKey('budget')).toBe(true)
    expect(isValidFieldKey('fb_post')).toBe(true)
  })
  it('ปฏิเสธขึ้นต้นด้วยตัวเลข/มีอักขระแปลก/ว่าง', () => {
    expect(isValidFieldKey('1budget')).toBe(false)
    expect(isValidFieldKey('fb-post')).toBe(false)
    expect(isValidFieldKey('')).toBe(false)
    expect(isValidFieldKey(null)).toBe(false)
  })
  it('ยาวเกิน 50 ตัวไม่รับ', () => {
    expect(isValidFieldKey('a' + 'b'.repeat(50))).toBe(false)
  })
})
