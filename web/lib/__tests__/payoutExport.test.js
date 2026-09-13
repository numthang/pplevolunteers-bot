import { describe, it, expect } from 'vitest'
import { validateItems, totalAmount, buildExport, getFormat } from '../payoutExport/index.js'
import { chunkIntoGroups, groupLabel } from '../payoutExport/shared.js'
import { buildPlainText } from '../payoutExport/plainText.js'

const round = { id: 7, title: 'เบี้ยเลี้ยงลงพื้นที่ ต.ค.' }
const account = { name: 'บัญชีเขตราชบุรี', bank: 'กสิกรไทย', account_no: '1234567890' }

const member = (over = {}) => ({
  id: 1,
  payee_name: 'สมชาย ใจดี',
  payment_method: 'bank',
  bank_code: '004',
  account_no: '123-4-56789-0',
  amount: 300,
  ...over,
})

// ---- validateItems ----
describe('validateItems', () => {
  it('บรรทัดครบผ่าน', () => {
    expect(validateItems([member()]).ok).toBe(true)
  })

  it('รอบว่างไม่ผ่าน', () => {
    const { ok, problems } = validateItems([])
    expect(ok).toBe(false)
    expect(problems[0].reason).toBe('empty')
  })

  it('ยอด 0 ไม่ผ่าน', () => {
    expect(validateItems([member({ amount: 0 })]).problems[0].reason).toBe('amount')
  })

  it('ยอดติดลบไม่ผ่าน', () => {
    expect(validateItems([member({ amount: -50 })]).problems[0].reason).toBe('amount')
  })

  it('ไม่มีชื่อผู้รับไม่ผ่าน', () => {
    expect(validateItems([member({ payee_name: '  ' })]).problems[0].reason).toBe('name')
  })

  it('รหัสธนาคารไม่มีในสารบบไม่ผ่าน', () => {
    expect(validateItems([member({ bank_code: '999' })]).problems[0].reason).toBe('bank_code')
  })

  it('ไม่ได้กรอกเลขบัญชีไม่ผ่าน', () => {
    expect(validateItems([member({ account_no: '' })]).problems[0].reason).toBe('account_no')
  })

  it('พร้อมเพย์เบอร์ 10 หลักผ่าน', () => {
    expect(validateItems([member({ payment_method: 'promptpay', bank_code: null, account_no: null, promptpay_id: '089-123-4567' })]).ok).toBe(true)
  })

  it('พร้อมเพย์เลขบัตร 13 หลักผ่าน', () => {
    expect(validateItems([member({ payment_method: 'promptpay', promptpay_id: '1234567890123' })]).ok).toBe(true)
  })

  it('พร้อมเพย์เลขหลักไม่ถูกไม่ผ่าน', () => {
    expect(validateItems([member({ payment_method: 'promptpay', promptpay_id: '08912345' })]).problems[0].reason).toBe('promptpay')
  })

  it('รายงานทุกบรรทัดที่พัง ไม่ใช่แค่บรรทัดแรก', () => {
    const { problems } = validateItems([
      member({ id: 1 }),
      member({ id: 2, amount: 0 }),
      member({ id: 3, bank_code: null }),
    ])
    expect(problems.map(p => p.id)).toEqual([2, 3])
  })
})

// ---- totalAmount ----
describe('totalAmount', () => {
  it('บวกยอดที่เป็น string จาก pg numeric ได้', () => {
    expect(totalAmount([{ amount: '300.00' }, { amount: '250.50' }])).toBe(550.5)
  })
  it('รอบว่างได้ 0', () => expect(totalAmount([])).toBe(0))
})

// ---- buildExport (generic-csv) ----
describe('buildExport generic-csv', () => {
  const items = [
    member({ id: 1, amount: '300.00' }),
    member({ id: 2, payee_name: 'สมหญิง "เจ๊" ดีงาม', payment_method: 'promptpay', promptpay_id: '0891234567', amount: '250.50', note: 'ค่าเดินทาง' }),
  ]
  const out = buildExport('generic-csv', { round, items, account })

  it('ขึ้นต้นด้วย BOM ให้ Excel อ่านไทยออก', () => {
    expect(out.content.charCodeAt(0)).toBe(0xfeff)
  })

  it('header บอกจำนวนรายการและยอดรวมตรงกับ items', () => {
    expect(out.content).toContain('"จำนวนรายการ",2')
    expect(out.content).toContain('"ยอดรวม",550.50')
  })

  it('มีบรรทัดข้อมูลครบทุกคน', () => {
    const rows = out.content.trimEnd().split('\r\n')
    const headIdx = rows.findIndex(r => r.startsWith('"กลุ่ม"'))
    expect(rows.length - headIdx - 1).toBe(2)
  })

  it('เลขบัญชีถูก normalize เหลือตัวเลขล้วนและกัน Excel ตัดศูนย์หน้า', () => {
    expect(out.content).toContain('="1234567890"')
    expect(out.content).toContain('="0891234567"')
  })

  it('เครื่องหมายคำพูดในชื่อไม่ทำ CSV พัง', () => {
    expect(out.content).toContain('"สมหญิง ""เจ๊"" ดีงาม"')
  })

  it('แถวพร้อมเพย์ไม่มีชื่อ/รหัสธนาคาร', () => {
    const ppRow = out.content.split('\r\n').find(r => r.includes('0891234567'))
    expect(ppRow).toContain('"พร้อมเพย์"')
    expect(ppRow).toContain(',"","",')
  })

  it('ชื่อไฟล์มีเลขรอบ', () => {
    expect(out.filename).toMatch(/^payout-7-\d{8}\.csv$/)
  })

  it('ข้อมูลไม่ครบต้องโยน error พร้อมรายชื่อคนที่ขาด ไม่ใช่ออกไฟล์พังๆ', () => {
    try {
      buildExport('generic-csv', { round, items: [member({ account_no: '' })], account })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e.problems?.[0]).toMatchObject({ name: 'สมชาย ใจดี', reason: 'account_no' })
    }
  })
})

// ---- registry ----
describe('getFormat', () => {
  it('id ที่ไม่รู้จักตกกลับมาที่ CSV กลาง', () => {
    expect(getFormat('kbiz-txt').id).toBe('generic-csv')
  })
})

// ---- แบ่งกลุ่มตามเพดานแอปธนาคาร (10 คน/ครั้ง) ----
describe('chunkIntoGroups', () => {
  const mk = n => Array.from({ length: n }, (_, i) => ({ id: i + 1, amount: 100 }))

  it('12 คน = กลุ่ม A 10 + กลุ่ม B 2', () => {
    const g = chunkIntoGroups(mk(12))
    expect(g.map(x => [x.label, x.rows.length])).toEqual([['A', 10], ['B', 2]])
  })

  it('พอดี 10 คนได้กลุ่มเดียว ไม่มีกลุ่มว่างต่อท้าย', () => {
    expect(chunkIntoGroups(mk(10)).length).toBe(1)
  })

  it('ยอดรวมรายกลุ่มถูกต้อง', () => {
    expect(chunkIntoGroups(mk(12))[1].total).toBe(200)
  })

  it('groupLabel ไล่ A B C ตาม index', () => {
    expect([groupLabel(0), groupLabel(9), groupLabel(10), groupLabel(20)]).toEqual(['A', 'A', 'B', 'C'])
  })
})

// ---- CSV มีคอลัมน์กลุ่ม ----
describe('generic-csv group column', () => {
  const items = Array.from({ length: 11 }, (_, i) => member({ id: i + 1, payee_name: `คน ${i + 1}` }))
  const out = buildExport('generic-csv', { round, items, account })

  it('บอกจำนวนกลุ่มในหัวไฟล์', () => {
    expect(out.content).toContain('"จำนวนกลุ่ม",2')
  })

  it('คนที่ 11 อยู่กลุ่ม B', () => {
    const row = out.content.split('\r\n').find(r => r.includes('คน 11'))
    expect(row.startsWith('"B",11,')).toBe(true)
  })
})

// ---- ข้อความส่งต่อให้คนอื่นกดโอน ----
describe('buildPlainText', () => {
  const items = [
    member({ id: 1, payee_name: 'สมชาย ใจดี', amount: 300 }),
    member({ id: 2, payee_name: 'สมหญิง ดีงาม', payment_method: 'promptpay', promptpay_id: '089-123-4567', amount: 250 }),
  ]
  const text = buildPlainText(round, items, account)

  it('มีหัวรอบและยอดรวม', () => {
    expect(text).toContain('เบี้ยเลี้ยงลงพื้นที่ ต.ค.')
    expect(text).toContain('รวม 2 คน · 550 บาท')
  })

  it('เลขบัญชีเป็นตัวเลขล้วน ก๊อปจากแชตไปวางได้เลย', () => {
    expect(text).toContain('กสิกรไทย 1234567890')
    expect(text).toContain('พร้อมเพย์ 0891234567')
  })

  it('แบ่งกลุ่มมาให้ในข้อความ', () => {
    expect(text).toContain('— กลุ่ม A (2 คน · 550 บาท)')
  })
})
