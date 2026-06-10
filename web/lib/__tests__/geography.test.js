import { describe, it, expect } from 'vitest'
import { expandGrants, PROVINCES_BY_SUB_REGION, PROVINCES_BY_MAIN_REGION } from '../geography.js'

// ---- province grant ----
describe('expandGrants — province', () => {
  it('finance: province → จังหวัดเดียว', () =>
    expect([...expandGrants(['province:ราชบุรี'], { mode: 'finance' })]).toEqual(['ราชบุรี']))
  it('calling: province → จังหวัดเดียว', () =>
    expect([...expandGrants(['province:ราชบุรี'], { mode: 'calling' })]).toEqual(['ราชบุรี']))
  it('หลายจังหวัด → union', () =>
    expect(new Set(expandGrants(['province:ราชบุรี', 'province:นครปฐม'], { mode: 'finance' })))
      .toEqual(new Set(['ราชบุรี', 'นครปฐม'])))
})

// ---- subregion grant — ทั้งสองระบบรู้จัก ----
describe('expandGrants — subregion', () => {
  it('finance: subregion → ทุกจังหวัดในภาคย่อย', () =>
    expect(new Set(expandGrants(['subregion:ทีมภาคกลางตะวันตก'], { mode: 'finance' })))
      .toEqual(new Set(PROVINCES_BY_SUB_REGION['ทีมภาคกลางตะวันตก'])))
  it('calling: subregion → ทุกจังหวัดในภาคย่อย (เท่ากับ finance)', () =>
    expect(new Set(expandGrants(['subregion:ทีมภาคกลางตะวันตก'], { mode: 'calling' })))
      .toEqual(new Set(PROVINCES_BY_SUB_REGION['ทีมภาคกลางตะวันตก'])))
  it('ราชบุรี อยู่ใน ภาคกลางตะวันตก', () =>
    expect(expandGrants(['subregion:ทีมภาคกลางตะวันตก'], { mode: 'calling' }).has('ราชบุรี')).toBe(true))
})

// ---- region grant — finance เห็น, calling มองข้าม (SPEC §7) ----
describe('expandGrants — region (ภาคใหญ่)', () => {
  it('finance: region → ทุกจังหวัดในภาคใหญ่', () =>
    expect(new Set(expandGrants(['region:ทีมภาคกลาง'], { mode: 'finance' })))
      .toEqual(new Set(PROVINCES_BY_MAIN_REGION['ทีมภาคกลาง'])))
  it('calling: region → ว่าง (ไม่รู้จักภาคใหญ่)', () =>
    expect(expandGrants(['region:ทีมภาคกลาง'], { mode: 'calling' }).size).toBe(0))
  it('finance: ภาคกลาง ครอบทั้ง ภาคกลางตะวันตก + ตะวันออก', () => {
    const got = expandGrants(['region:ทีมภาคกลาง'], { mode: 'finance' })
    expect(got.has('ราชบุรี')).toBe(true)   // ตะวันตก
    expect(got.has('ลพบุรี')).toBe(true)    // ตะวันออก
  })
})

// ---- mixed + edge cases ----
describe('expandGrants — mixed & edge', () => {
  it('grant ว่าง → set ว่าง', () =>
    expect(expandGrants([], { mode: 'finance' }).size).toBe(0))
  it('default param ([]) → set ว่าง', () =>
    expect(expandGrants(undefined, { mode: 'finance' }).size).toBe(0))
  it('unknown mode → throw', () =>
    expect(() => expandGrants(['province:ราชบุรี'], { mode: 'xxx' })).toThrow())
  it('region grant ที่ไม่รู้จัก → มองข้าม ไม่ error', () =>
    expect(expandGrants(['region:ทีมไม่มีจริง'], { mode: 'finance' }).size).toBe(0))
  it('calling: province + region → ได้แค่ province (region ถูกมองข้าม)', () =>
    expect([...expandGrants(['province:เชียงใหม่', 'region:ทีมภาคเหนือ'], { mode: 'calling' })])
      .toEqual(['เชียงใหม่']))
})
