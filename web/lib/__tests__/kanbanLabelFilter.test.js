import { describe, it, expect } from 'vitest'
import { collectFilterGroups, cardMatchesLabels, filterCards } from '../kanbanLabelFilter.js'

// ป้ายตัวอย่าง — ชื่อกลุ่มมาจากของจริงบน dev (สายงาน 12 · พื้นที่ 9 · อุปกรณ์ 8)
// ⚠️ id เป็นสตริงบ้างตัวเลขบ้าง จงใจ — pg คืน BIGINT มาเป็นสตริง แต่โค้ดเก่า/mock ส่งตัวเลข
const media   = { id: '1', name: 'สื่อ',     group: 'สายงาน' }
const finance = { id: 2,   name: 'การเงิน',  group: 'สายงาน' }
const ratcha  = { id: '3', name: 'ราชบุรี',  group: 'พื้นที่' }
const photha  = { id: 4,   name: 'โพธาราม', group: 'พื้นที่' }
const banner  = { id: '5', name: 'ป้ายไวนิล', group: 'อุปกรณ์' }
const loose   = { id: '6', name: 'ด่วน',     group: null }

const card = (id, labels) => ({ id, title: `การบ้าน ${id}`, labels })

// ---- collectFilterGroups ----
describe('collectFilterGroups', () => {
  it('เก็บเฉพาะป้ายที่มีบนการ์ดที่โหลดมา ไม่ใช่ทั้งคลัง', () => {
    const groups = collectFilterGroups([card(1, [media]), card(2, [media, ratcha])])
    expect(groups.map(g => g.group)).toEqual(['พื้นที่', 'สายงาน'])
    expect(groups.flatMap(g => g.labels).map(l => l.name).sort()).toEqual(['ราชบุรี', 'สื่อ'])
  })

  it('นับจำนวนการ์ดต่อป้าย', () => {
    const groups = collectFilterGroups([card(1, [media]), card(2, [media, ratcha]), card(3, [ratcha])])
    const all = groups.flatMap(g => g.labels)
    expect(all.find(l => l.name === 'สื่อ').count).toBe(2)
    expect(all.find(l => l.name === 'ราชบุรี').count).toBe(2)
  })

  it('id คืนเป็นสตริงเสมอ (BIGINT จาก pg)', () => {
    const groups = collectFilterGroups([card(1, [finance])])
    expect(groups[0].labels[0].id).toBe('2')
  })

  it('ป้ายไม่มีกลุ่มอยู่กองท้ายสุด', () => {
    const groups = collectFilterGroups([card(1, [loose, media, ratcha])])
    expect(groups[groups.length - 1].group).toBe(null)
  })

  it('การ์ดไม่มีป้าย / ไม่มีการ์ดเลย → กองว่าง', () => {
    expect(collectFilterGroups([])).toEqual([])
    expect(collectFilterGroups([card(1, [])])).toEqual([])
    expect(collectFilterGroups([{ id: 9 }])).toEqual([])
  })
})

// ---- cardMatchesLabels ----
describe('cardMatchesLabels — OR ในกลุ่ม · AND ข้ามกลุ่ม', () => {
  const c = card(1, [media, ratcha])

  it('ไม่เลือกอะไรเลย = ผ่านหมด', () => {
    expect(cardMatchesLabels(c, [])).toBe(true)
    expect(cardMatchesLabels(card(2, []), [])).toBe(true)
  })

  it('เลือกป้ายเดียวที่การ์ดมี → ผ่าน', () => {
    expect(cardMatchesLabels(c, [media])).toBe(true)
  })

  it('เลือกป้ายเดียวที่การ์ดไม่มี → ตก', () => {
    expect(cardMatchesLabels(c, [banner])).toBe(false)
  })

  it('OR: 2 ป้ายกลุ่มเดียวกัน มีอันใดอันหนึ่งก็ผ่าน', () => {
    expect(cardMatchesLabels(c, [ratcha, photha])).toBe(true)
  })

  it('AND: ข้ามกลุ่มต้องมีครบทุกกอง', () => {
    expect(cardMatchesLabels(c, [media, ratcha])).toBe(true)
    expect(cardMatchesLabels(c, [media, photha])).toBe(false)   // สายงานผ่าน แต่พื้นที่ไม่ตรง
    expect(cardMatchesLabels(c, [media, ratcha, banner])).toBe(false)
  })

  it('ผสม OR+AND: (สื่อ|การเงิน) และ (ราชบุรี|โพธาราม)', () => {
    const selected = [media, finance, ratcha, photha]
    expect(cardMatchesLabels(card(1, [finance, photha]), selected)).toBe(true)
    expect(cardMatchesLabels(card(2, [finance]), selected)).toBe(false)
    expect(cardMatchesLabels(card(3, [photha]), selected)).toBe(false)
  })

  it('เทียบ id ข้ามชนิด (สตริง ↔ ตัวเลข) ได้', () => {
    expect(cardMatchesLabels(card(1, [{ id: 3, name: 'ราชบุรี', group: 'พื้นที่' }]), [ratcha])).toBe(true)
    expect(cardMatchesLabels(card(2, [{ id: '2', name: 'การเงิน', group: 'สายงาน' }]), [finance])).toBe(true)
  })

  it('รับ shape ของ labels.js (group_name) ได้เหมือน cards.js (group)', () => {
    const asDbRow = { id: '3', name: 'ราชบุรี', group_name: 'พื้นที่' }
    expect(cardMatchesLabels(card(1, [asDbRow]), [ratcha])).toBe(true)
    expect(cardMatchesLabels(card(1, [ratcha]), [asDbRow])).toBe(true)
  })

  it('ป้ายไม่มีกลุ่มเป็นกองของตัวเอง — ไม่ปนกับกองอื่น', () => {
    expect(cardMatchesLabels(card(1, [media]), [media, loose])).toBe(false)
    expect(cardMatchesLabels(card(2, [media, loose]), [media, loose])).toBe(true)
  })

  it('การ์ดไม่มีป้ายเลย + มีตัวกรอง → ตก', () => {
    expect(cardMatchesLabels(card(1, []), [media])).toBe(false)
    expect(cardMatchesLabels({ id: 1 }, [media])).toBe(false)
  })
})

// ---- filterCards ----
describe('filterCards', () => {
  const cards = [card(1, [media, ratcha]), card(2, [finance, ratcha]), card(3, [media, photha]), card(4, [])]

  it('ไม่มีตัวกรอง = คืน array เดิมทั้งอ้าง (ไม่ copy)', () => {
    expect(filterCards(cards, [])).toBe(cards)
  })

  it('กรองแล้วเก็บลำดับเดิม (หน้าแรกเรียงตามกำหนดส่งมาแล้ว)', () => {
    expect(filterCards(cards, [media]).map(c => c.id)).toEqual([1, 3])
  })

  it('AND ข้ามกลุ่มบนรายการจริง', () => {
    expect(filterCards(cards, [media, ratcha]).map(c => c.id)).toEqual([1])
  })

  it('กรองแล้วไม่เหลืออะไร → array ว่าง ไม่ใช่ทั้งหมด', () => {
    expect(filterCards(cards, [banner])).toEqual([])
  })
})
