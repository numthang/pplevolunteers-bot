import { describe, it, expect } from 'vitest'
import { roundStage } from '../payoutStage.js'

// รอบ 5 คน ติ๊กจ่ายครบ แจ้งได้ 4 (อีก 1 เป็นคนนอก) — ฐานของเคสที่ซับซ้อนสุด
const base = { status: 'exported', item_count: 5, paid_count: 5, notifiable_count: 4, notified_count: 0 }

describe('roundStage', () => {
  it('ยังไม่ export → ร่าง', () => {
    expect(roundStage({ ...base, status: 'draft' }).key).toBe('draft')
  })

  it('ปิดรอบแล้ว → closed ไม่ว่าตัวเลขแจ้งจะเป็นยังไง', () => {
    expect(roundStage({ ...base, status: 'paid', notified_count: 0 }).key).toBe('closed')
    expect(roundStage({ ...base, status: 'paid', notified_count: 4 }).key).toBe('closed')
  })

  it('export แล้วแต่ยังไม่มีรายชื่อ → empty', () => {
    expect(roundStage({ status: 'exported', item_count: 0, paid_count: 0 }).key).toBe('empty')
  })

  it('ยังไม่ติ๊กใครเลย → เตรียมโอน', () => {
    expect(roundStage({ ...base, paid_count: 0 }).key).toBe('ready')
  })

  it('ติ๊กบางส่วน → paying พร้อมตัวเลข', () => {
    const s = roundStage({ ...base, paid_count: 2 })
    expect(s).toMatchObject({ key: 'paying', paid: 2, count: 5 })
  })

  it('ติ๊กครบ แจ้งยังไม่ครบ → รอแจ้ง', () => {
    expect(roundStage({ ...base, notified_count: 3 }).key).toBe('waitNotify')
  })

  it('ติ๊กครบ แจ้งครบเท่าที่แจ้งได้ → แจ้งโอนแล้ว', () => {
    expect(roundStage({ ...base, notified_count: 4 }).key).toBe('notified')
  })

  // ⛔ เคสที่เคยพลาดตอนออกแบบ: 0 >= 0 เป็นจริงแบบว่างเปล่า
  it('ไม่มีใครแจ้งได้เลย → paidAll ห้ามขึ้นว่าแจ้งโอนแล้ว', () => {
    const s = roundStage({ ...base, notifiable_count: 0, notified_count: 0 })
    expect(s.key).toBe('paidAll')
    expect(s.cantNotify).toBe(5)
  })

  it('นับจำนวนคนที่แจ้งไม่ได้ไว้ให้หน้าจอต่อท้ายป้าย', () => {
    expect(roundStage(base).cantNotify).toBe(1)
    expect(roundStage({ ...base, notifiable_count: 5 }).cantNotify).toBe(0)
  })

  it('ฟิลด์หาย/เป็น null ไม่ทำให้พัง', () => {
    expect(roundStage({ status: 'exported' }).key).toBe('empty')
    expect(roundStage({}).key).toBe('draft')
    expect(roundStage(null).key).toBe('draft')
  })

  it('ยอดนับมาเป็น string จาก pg ก็ยังถูก', () => {
    const s = roundStage({ status: 'exported', item_count: '5', paid_count: '5', notifiable_count: '4', notified_count: '4' })
    expect(s.key).toBe('notified')
  })
})
