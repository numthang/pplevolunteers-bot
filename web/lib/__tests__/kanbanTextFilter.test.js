import { describe, it, expect } from 'vitest'
import { filterCardsByText } from '../kanbanTextFilter.js'

const card = (over = {}) => ({
  id: 1, ref_no: 139,
  title: 'ตามรอยนกเงือก เดินป่าบางกะม่า',
  detail: 'ประสานงานกับเทศบาลเรื่องรถรับส่ง',
  assignees: [{ user_id: 1, name: 'ธนวัฒน์' }, { user_id: 2, name: 'Somsri' }],
  ...over,
})

const cards = [
  card(),
  card({ id: 2, ref_no: 140, title: 'จัดงาน PrideMonth ราชบุรี', detail: null, assignees: [{ user_id: 2, name: 'Somsri' }] }),
  card({ id: 3, ref_no: 141, title: 'ไฟทางสาธารณะ', detail: 'ซอย 5 ดับทั้งซอย', assignees: [] }),
]
const ids = (rows) => rows.map((c) => c.id)

describe('filterCardsByText', () => {
  it('คำค้นว่าง = ไม่กรอง',      () => expect(filterCardsByText(cards, '')).toBe(cards))
  it('ช่องว่างล้วน = ไม่กรอง',   () => expect(filterCardsByText(cards, '   ')).toBe(cards))
  it('null = ไม่กรอง',          () => expect(filterCardsByText(cards, null)).toBe(cards))

  it('เจอในชื่อ',               () => expect(ids(filterCardsByText(cards, 'นกเงือก'))).toEqual([1]))
  it('เจอในรายละเอียด',         () => expect(ids(filterCardsByText(cards, 'เทศบาล'))).toEqual([1]))
  it('เจอกลางคำได้ (ไทยไม่มีเว้นวรรค)', () => expect(ids(filterCardsByText(cards, 'สาธารณ'))).toEqual([3]))

  // ⭐ ค้นด้วยรหัสที่ก๊อปมาจากดิสฯ — รับทุกรูปแบบที่ parseRef รับ
  it('ค้นด้วย KB-140',          () => expect(ids(filterCardsByText(cards, 'KB-140'))).toEqual([2]))
  it('ค้นด้วย kb140 (ไม่มีขีด)', () => expect(ids(filterCardsByText(cards, 'kb140'))).toEqual([2]))
  it('ค้นด้วย K-140 ของเก่า',   () => expect(ids(filterCardsByText(cards, 'K-140'))).toEqual([2]))
  it('ค้นด้วยเลขล้วน 141',      () => expect(ids(filterCardsByText(cards, '141'))).toEqual([3]))

  it('เจอในชื่อผู้รับผิดชอบคนแรก', () => expect(ids(filterCardsByText(cards, 'ธนวัฒน์'))).toEqual([1]))
  it('เจอในชื่อผู้รับผิดชอบคนที่สอง', () => expect(ids(filterCardsByText(cards, 'somsri'))).toEqual([1, 2]))
  it('ไม่สนตัวพิมพ์เล็กใหญ่',    () => expect(ids(filterCardsByText(cards, 'PRIDEMONTH'))).toEqual([2]))

  // หลายคำ = AND — พิมพ์คำที่ 2 ต้องแคบลง ไม่ใช่กว้างขึ้น
  it('2 คำ ต้องเจอครบ',         () => expect(ids(filterCardsByText(cards, 'นกเงือก เทศบาล'))).toEqual([1]))
  it('2 คำ เจอไม่ครบ = ตก',     () => expect(ids(filterCardsByText(cards, 'นกเงือก PrideMonth'))).toEqual([]))
  it('คำค้นคนละใบ = ว่าง',      () => expect(ids(filterCardsByText(cards, 'ไฟทาง ราชบุรี'))).toEqual([]))

  it('ไม่เจอ = ว่าง',           () => expect(filterCardsByText(cards, 'zzzz')).toEqual([]))

  // ฟิลด์ว่าง/ไม่มี ต้องไม่ระเบิด
  it('detail null ไม่พัง',      () => expect(ids(filterCardsByText(cards, 'PrideMonth'))).toEqual([2]))
  it('ไม่มี assignees ไม่พัง',  () => expect(() => filterCardsByText([{ id: 9, ref_no: 1 }], 'x')).not.toThrow())
  it('cards ว่าง',              () => expect(filterCardsByText([], 'x')).toEqual([]))
  it('cards null',              () => expect(filterCardsByText(null, 'x')).toEqual([]))

  // ⛔ คำในฟิลด์ที่ไม่ได้อยู่ใน haystack ต้องไม่แมตช์ (custom field มีตัวกรองตัวเลือกแยกอยู่แล้ว)
  it('ไม่ค้นใน custom field', () => {
    const withField = [card({ id: 7, title: 'ก', detail: null, assignees: [],
      fields: [{ label: 'อุปกรณ์', value: 'เต็นท์' }] })]
    expect(filterCardsByText(withField, 'เต็นท์')).toEqual([])
  })
})
