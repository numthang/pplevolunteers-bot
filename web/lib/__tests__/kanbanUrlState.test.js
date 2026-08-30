import { describe, it, expect } from 'vitest'
import {
  parseViewFromParams,
  viewToQueryString,
  mergeViewIntoSearch,
  unknownSelections,
  DEFAULT_VIEW,
} from '../kanbanUrlState.js'

describe('parseViewFromParams', () => {
  it('query ว่าง = ค่าตั้งต้น', () => {
    expect(parseViewFromParams('')).toEqual(DEFAULT_VIEW)
  })

  it('อ่านครบทุกตัว', () => {
    const v = parseViewFromParams('board=3&scope=all&group=due&status=backlog,doing&kind=case&helper=12,45&label=12.88,15.4&q=ราชบุรี&sort=due_at:desc')
    expect(v.board).toBe(3)
    expect(v.scope).toBe('all')
    expect(v.group).toBe('due')
    expect(v.status).toEqual(['backlog', 'doing'])
    expect(v.kind).toEqual(['case'])
    expect(v.helper).toEqual(['12', '45'])
    expect(v.label).toEqual([
      { field_id: '12', id: '88' },
      { field_id: '15', id: '4' },
    ])
    expect(v.q).toBe('ราชบุรี')
    expect(v.sort).toEqual({ key: 'due_at', dir: 'desc' })
  })

  it('ค่าที่ไม่รู้จักตกกลับค่าตั้งต้น ไม่ throw (ลิงก์ที่คนแก้มือต้องเปิดได้)', () => {
    const v = parseViewFromParams('scope=หมา&group=แมว&status=ไม่มีสถานะนี้&kind=zzz&board=abc')
    expect(v.scope).toBe('mine')
    expect(v.group).toBe('status')
    expect(v.status).toEqual([])
    expect(v.kind).toEqual([])
    expect(v.board).toBe(null)
  })

  it('label ที่ไม่มีจุด (ลิงก์เก่า/พิมพ์มือ) ยังอ่านได้ แต่ไม่รู้ field', () => {
    expect(parseViewFromParams('label=88').label).toEqual([{ id: '88', field_id: null }])
  })

  it('sort ที่ไม่ระบุทิศ = asc', () => {
    expect(parseViewFromParams('sort=title').sort).toEqual({ key: 'title', dir: 'asc' })
  })

  it('รับ URLSearchParams ตรงๆ ได้ด้วย', () => {
    expect(parseViewFromParams(new URLSearchParams('group=due')).group).toBe('due')
  })
})

describe('viewToQueryString', () => {
  it('ค่าตั้งต้นล้วน = สตริงว่าง (ลิงก์ต้องสั้น)', () => {
    expect(viewToQueryString(DEFAULT_VIEW)).toBe('')
    expect(viewToQueryString({})).toBe('')
  })

  it('เขียนเฉพาะที่ต่างจากค่าตั้งต้น', () => {
    expect(viewToQueryString({ ...DEFAULT_VIEW, group: 'due' })).toBe('group=due')
    expect(viewToQueryString({ ...DEFAULT_VIEW, scope: 'unassigned' })).toBe('scope=unassigned')
  })

  it('label เขียนเป็น field_id.option_id', () => {
    const qs = viewToQueryString({ ...DEFAULT_VIEW, label: [{ id: '88', field_id: '12' }] })
    expect(decodeURIComponent(qs)).toBe('label=12.88')
  })

  it('label ที่ไม่มี field_id เขียน id เปล่า', () => {
    const qs = viewToQueryString({ ...DEFAULT_VIEW, label: [{ id: '88', field_id: null }] })
    expect(decodeURIComponent(qs)).toBe('label=88')
  })

  it('ค้นหาที่มีแต่ช่องว่างไม่นับ', () => {
    expect(viewToQueryString({ ...DEFAULT_VIEW, q: '   ' })).toBe('')
  })

  it('ไป-กลับแล้วได้ของเดิม (round-trip)', () => {
    const view = {
      board: 3, scope: 'all', group: 'due',
      status: ['backlog'], kind: ['case', 'post'], helper: ['12'],
      label: [{ id: '88', field_id: '12' }], q: 'ทดสอบ',
      sort: { key: 'field_9', dir: 'desc' },
    }
    expect(parseViewFromParams(viewToQueryString(view))).toEqual(view)
  })
})

describe('mergeViewIntoSearch', () => {
  it('คง ?card= ไว้เสมอ — กดตัวกรองตอนการ์ดกางอยู่ต้องไม่เด้งปิด', () => {
    const out = mergeViewIntoSearch('?card=KB-42', { ...DEFAULT_VIEW, group: 'due' })
    const p = new URLSearchParams(out)
    expect(p.get('card')).toBe('KB-42')
    expect(p.get('group')).toBe('due')
  })

  it('ไม่มี card ก็ไม่ต้องเติม', () => {
    expect(mergeViewIntoSearch('', { ...DEFAULT_VIEW, group: 'due' })).toBe('group=due')
  })

  it('ค่าตั้งต้น + การ์ดเปิดอยู่ = เหลือแต่ card', () => {
    expect(mergeViewIntoSearch('?card=7', DEFAULT_VIEW)).toBe('card=7')
  })
})

describe('unknownSelections', () => {
  it('คืนเฉพาะตัวที่ไม่มีในการ์ดที่โหลดมา', () => {
    const selected = [{ id: '88' }, { id: 91 }]
    expect(unknownSelections(selected, new Set(['88']))).toEqual([{ id: 91 }])
  })

  it('รู้จักหมด = ว่าง', () => {
    expect(unknownSelections([{ id: '88' }], new Set(['88']))).toEqual([])
  })

  it('id เป็นตัวเลขกับสตริงต้องเทียบกันติด (pg คืน BIGINT เป็นสตริง)', () => {
    expect(unknownSelections([{ id: 88 }], new Set(['88']))).toEqual([])
  })
})
