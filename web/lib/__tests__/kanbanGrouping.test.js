import { describe, it, expect } from 'vitest'
import { dueBucket, isMyCard, groupCards, sortCards, DUE_BUCKETS } from '../kanbanGrouping.js'

// นาฬิกาตรึงไว้ — ห้ามให้เทสขึ้นกับเวลาที่รัน
const NOW = new Date('2026-08-18T10:00:00+07:00')
const at = (iso) => new Date(iso).toISOString()

const ME = 7, OTHER = 8, HELPER = 9

const card = (over = {}) => ({
  id: 1,
  status_type: 'doing',
  owner_user_id: OTHER,
  helper_ids: [],
  due_at: null,
  priority: 0,
  created_at: at('2026-08-01T00:00:00+07:00'),
  ...over,
})

// ---- dueBucket ----
describe('dueBucket', () => {
  it('ไม่มีกำหนด → none', () => expect(dueBucket(null, NOW)).toBe('none'))
  it('วันที่อ่านไม่ออก → none', () => expect(dueBucket('ไม่ใช่วันที่', NOW)).toBe('none'))
  it('เมื่อวาน → overdue', () => expect(dueBucket(at('2026-08-17T18:00:00+07:00'), NOW)).toBe('overdue'))
  it('เช้านี้ที่ผ่านมาแล้ว → overdue (ไม่ใช่ today)', () =>
    expect(dueBucket(at('2026-08-18T09:00:00+07:00'), NOW)).toBe('overdue'))
  it('เย็นนี้ → today', () => expect(dueBucket(at('2026-08-18T17:00:00+07:00'), NOW)).toBe('today'))
  it('พรุ่งนี้ → week', () => expect(dueBucket(at('2026-08-19T09:00:00+07:00'), NOW)).toBe('week'))
  it('อีก 7 วันพอดี → week (ขอบใน)', () => expect(dueBucket(at('2026-08-25T09:00:00+07:00'), NOW)).toBe('week'))
  it('อีก 8 วัน → later', () => expect(dueBucket(at('2026-08-26T12:00:00+07:00'), NOW)).toBe('later'))
})

// ---- isMyCard ----
describe('isMyCard — เจ้าภาพ + คนช่วย เท่านั้น', () => {
  it('ฉันเป็นเจ้าภาพ → ใช่', () => expect(isMyCard(card({ owner_user_id: ME }), ME)).toBe(true))
  it('ฉันเป็นคนช่วย → ใช่', () => expect(isMyCard(card({ helper_ids: [HELPER, ME] }), ME)).toBe(true))
  it('ของคนอื่นล้วน → ไม่ใช่', () => expect(isMyCard(card(), ME)).toBe(false))
  // ⛔ 2026-09-03 กลับคำจาก 2026-08-18 — "งานไม่มีเจ้าภาพ = ของฉันของทุกคน" ทำให้
  //    "ไม่มีเจ้าภาพ" แพงจนระบบยัดเจ้าภาพปลอมเข้าไป (backfill 176 ใบ + SOURCE_SQL.post)
  //    ของที่มาแทน = มุมมอง "ยังไม่มีคนรับ (n)" ที่มีเลขกำกับทั้งมือถือและจอใหญ่
  it('⭐ ยังไม่มีเจ้าภาพ → **ไม่ใช่** ของฉัน (ไปอยู่มุมมอง "ยังไม่มีคนรับ" แทน)', () =>
    expect(isMyCard(card({ owner_user_id: null, status_type: 'backlog' }), ME)).toBe(false))
  it('id คนละชนิด (สตริง ↔ ตัวเลข) ยังตรงกัน', () => {
    expect(isMyCard(card({ owner_user_id: '7' }), 7)).toBe(true)
    expect(isMyCard(card({ helper_ids: ['7'] }), 7)).toBe(true)
  })
  it('debug mode (userId null) → ไม่ใช่ของใครทั้งนั้น', () => {
    expect(isMyCard(card({ owner_user_id: null }), null)).toBe(false)
    expect(isMyCard(card({ owner_user_id: ME }), null)).toBe(false)
  })
  it('ไม่มีการ์ด → ไม่ใช่', () => expect(isMyCard(null, ME)).toBe(false))
})

// ---- groupCards ----
describe('groupCards', () => {
  it('โหมดสถานะ: คืนครบ 6 กองเสมอ แม้กองว่าง (ต้องมีที่ให้ลากลง)', () => {
    const groups = groupCards([card({ status_type: 'doing' })], 'status', NOW)
    expect(groups.map(g => g.key)).toEqual(['backlog', 'doing', 'review', 'ready', 'done', 'cancelled'])
    expect(groups.find(g => g.key === 'doing').cards).toHaveLength(1)
    expect(groups.find(g => g.key === 'done').cards).toHaveLength(0)
  })

  it('โหมดกำหนดส่ง: คืนครบ 5 กองตามลำดับความเร่ง', () => {
    expect(groupCards([], 'due', NOW).map(g => g.key)).toEqual(DUE_BUCKETS)
  })

  it('โหมดกำหนดส่ง: แยกกองถูกตามวัน', () => {
    const cards = [
      card({ id: 1, due_at: at('2026-08-16T09:00:00+07:00') }),
      card({ id: 2, due_at: at('2026-08-18T20:00:00+07:00') }),
      card({ id: 3, due_at: at('2026-08-21T09:00:00+07:00') }),
      card({ id: 4, due_at: null }),
    ]
    const g = Object.fromEntries(groupCards(cards, 'due', NOW).map(x => [x.key, x.cards.map(c => c.id)]))
    expect(g).toEqual({ overdue: [1], today: [2], week: [3], later: [], none: [4] })
  })

  it('⭐ โหมดกำหนดส่ง: งานที่เสร็จแล้ว/เข้ากรุ ไม่โผล่ (ไม่งั้นกอง "เลยกำหนด" เต็มไปด้วยงานที่จบแล้ว)', () => {
    const cards = [
      card({ id: 1, status_type: 'done', due_at: at('2026-08-01T09:00:00+07:00') }),
      card({ id: 2, status_type: 'cancelled', due_at: at('2026-08-01T09:00:00+07:00') }),
      card({ id: 3, status_type: 'doing', due_at: at('2026-08-01T09:00:00+07:00') }),
    ]
    const overdue = groupCards(cards, 'due', NOW).find(g => g.key === 'overdue')
    expect(overdue.cards.map(c => c.id)).toEqual([3])
  })

  it('โหมดสถานะ: งานที่เสร็จแล้วยังอยู่ในกอง "เสร็จ" ตามเดิม', () => {
    const groups = groupCards([card({ status_type: 'done' })], 'status', NOW)
    expect(groups.find(g => g.key === 'done').cards).toHaveLength(1)
  })
})

// ---- sortCards ----
describe('sortCards', () => {
  it('ใกล้ครบกำหนดขึ้นก่อน · ไม่มีกำหนดไปท้าย', () => {
    const cards = [
      card({ id: 1, due_at: null }),
      card({ id: 2, due_at: at('2026-08-25T09:00:00+07:00') }),
      card({ id: 3, due_at: at('2026-08-19T09:00:00+07:00') }),
    ]
    expect(sortCards(cards).map(c => c.id)).toEqual([3, 2, 1])
  })

  it('กำหนดส่งเท่ากัน → ความสำคัญสูงก่อน', () => {
    const cards = [
      card({ id: 1, due_at: null, priority: 0 }),
      card({ id: 2, due_at: null, priority: 2 }),
    ]
    expect(sortCards(cards).map(c => c.id)).toEqual([2, 1])
  })

  // user ทัก 2026-08-19: เพิ่มการ์ดในกองแล้วมันไปโผล่ล่างสุด ทั้งที่ช่องพิมพ์อยู่บนสุด
  it('กำหนดส่ง+ความสำคัญเท่ากัน → ของใหม่ขึ้นก่อน', () => {
    const cards = [
      card({ id: 1, due_at: null, created_at: at('2026-08-01T09:00:00+07:00') }),
      card({ id: 2, due_at: null, created_at: at('2026-08-19T09:00:00+07:00') }),
      card({ id: 3, due_at: null, created_at: at('2026-08-10T09:00:00+07:00') }),
    ]
    expect(sortCards(cards).map(c => c.id)).toEqual([2, 3, 1])
  })

  it('ไม่แก้ array เดิม', () => {
    const cards = [card({ id: 1, due_at: at('2026-08-25T09:00:00+07:00') }), card({ id: 2, due_at: null })]
    const copy = [...cards]
    sortCards(cards)
    expect(cards).toEqual(copy)
  })
})
