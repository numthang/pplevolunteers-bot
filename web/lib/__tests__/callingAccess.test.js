import { describe, it, expect } from 'vitest'
import { isAdmin, isRegionalCoordinator, isProvincialCoordinator, getUserScope, canAccessMember, canCreateCampaign, canOverrideTier, canSeeContacts } from '../callingAccess.js'

// ---- isAdmin ----
describe('isAdmin', () => {
  it('Admin ใช่',       () => expect(isAdmin(['Admin'])).toBe(true))
  it('เลขาธิการใช่',   () => expect(isAdmin(['เลขาธิการ'])).toBe(true))
  it('ไม่มียศไม่ใช่',  () => expect(isAdmin([])).toBe(false))
  it('Moderator ไม่ใช่', () => expect(isAdmin(['Moderator'])).toBe(false))
  it('ผู้ประสานงานภาค ไม่ใช่', () => expect(isAdmin(['ผู้ประสานงานภาค'])).toBe(false))
})

// ---- isRegionalCoordinator ----
describe('isRegionalCoordinator', () => {
  it('ผู้ประสานงานภาคใช่',  () => expect(isRegionalCoordinator(['ผู้ประสานงานภาค'])).toBe(true))
  it('รองเลขาธิการใช่',     () => expect(isRegionalCoordinator(['รองเลขาธิการ'])).toBe(true))
  it('กรรมการจังหวัดไม่ใช่', () => expect(isRegionalCoordinator(['กรรมการจังหวัด'])).toBe(false))
  it('ไม่มียศไม่ใช่',        () => expect(isRegionalCoordinator([])).toBe(false))
})

// ---- isProvincialCoordinator ----
describe('isProvincialCoordinator', () => {
  it('ผู้ประสานงานจังหวัดใช่', () => expect(isProvincialCoordinator(['ผู้ประสานงานจังหวัด'])).toBe(true))
  it('กรรมการจังหวัดใช่',      () => expect(isProvincialCoordinator(['กรรมการจังหวัด'])).toBe(true))
  it('ผู้ประสานงานภาคไม่ใช่',  () => expect(isProvincialCoordinator(['ผู้ประสานงานภาค'])).toBe(false))
})

// ---- getUserScope ----
describe('getUserScope', () => {
  it('Admin → null (ทุกจังหวัด)',     () => expect(getUserScope(['Admin'])).toBe(null))
  it('เลขาธิการ → null',              () => expect(getUserScope(['เลขาธิการ'])).toBe(null))
  it('ไม่มียศ → [] (ไม่มี scope)',    () => expect(getUserScope([])).toEqual([]))

  it('ผู้ประสานงานภาค + ทีมภาคกลางตะวันตก → ได้ราชบุรีและพวก', () => {
    const scope = getUserScope(['ผู้ประสานงานภาค', 'ทีมภาคกลางตะวันตก'])
    expect(scope).toContain('ราชบุรี')
    expect(scope).toContain('นครปฐม')
    expect(scope).not.toContain('เชียงใหม่')
  })

  it('กรรมการจังหวัด + ทีมราชบุรี → ได้แค่ราชบุรี', () => {
    const scope = getUserScope(['กรรมการจังหวัด', 'ทีมราชบุรี'])
    expect(scope).toEqual(['ราชบุรี'])
  })

  it('ผู้ประสานงานจังหวัด + ทีมเชียงใหม่ → ได้แค่เชียงใหม่', () => {
    const scope = getUserScope(['ผู้ประสานงานจังหวัด', 'ทีมเชียงใหม่'])
    expect(scope).toEqual(['เชียงใหม่'])
  })

  it('มียศ provincial แต่ไม่มีทีม → scope ว่าง', () => {
    const scope = getUserScope(['กรรมการจังหวัด'])
    expect(scope).toEqual([])
  })

  it('ทีมXXX อย่างเดียว (ไม่มีกรรมการจังหวัด) → ได้ scope จังหวัดนั้น', () => {
    const scope = getUserScope(['ทีมราชบุรี'])
    expect(scope).toEqual(['ราชบุรี'])
  })

  it('ทีมXXX อย่างเดียว หลายจังหวัด ไม่มี primaryProvince → ได้แค่จังหวัดแรก', () => {
    const scope = getUserScope(['ทีมราชบุรี', 'ทีมเชียงใหม่'])
    expect(scope).toEqual(['ราชบุรี'])
  })

  it('ทีมXXX หลายจังหวัด มี primaryProvince → ได้ primaryProvince เท่านั้น', () => {
    const scope = getUserScope(['ทีมราชบุรี', 'ทีมเชียงใหม่'], 'เชียงใหม่')
    expect(scope).toEqual(['เชียงใหม่'])
  })
})

// ---- canAccessMember ----
describe('canAccessMember', () => {
  it('Admin เข้าได้ทุกจังหวัด',           () => expect(canAccessMember('เชียงใหม่', ['Admin'])).toBe(true))
  it('เลขาธิการเข้าได้ทุกจังหวัด',        () => expect(canAccessMember('ราชบุรี', ['เลขาธิการ'])).toBe(true))
  it('ไม่มียศเข้าไม่ได้',                  () => expect(canAccessMember('ราชบุรี', [])).toBe(false))

  it('กรรมการจังหวัด + ทีมราชบุรี เข้าราชบุรีได้',    () => expect(canAccessMember('ราชบุรี', ['กรรมการจังหวัด', 'ทีมราชบุรี'])).toBe(true))
  it('กรรมการจังหวัด + ทีมราชบุรี เข้าเชียงใหม่ไม่ได้', () => expect(canAccessMember('เชียงใหม่', ['กรรมการจังหวัด', 'ทีมราชบุรี'])).toBe(false))

  it('ทีมราชบุรี อย่างเดียว เข้าราชบุรีได้',    () => expect(canAccessMember('ราชบุรี', ['ทีมราชบุรี'])).toBe(true))
  it('ทีมราชบุรี อย่างเดียว เข้าเชียงใหม่ไม่ได้', () => expect(canAccessMember('เชียงใหม่', ['ทีมราชบุรี'])).toBe(false))

  it('ผู้ประสานงานภาค + ทีมภาคกลางตะวันตก เข้าราชบุรีได้',  () => expect(canAccessMember('ราชบุรี', ['ผู้ประสานงานภาค', 'ทีมภาคกลางตะวันตก'])).toBe(true))
  it('ผู้ประสานงานภาค + ทีมภาคกลางตะวันตก เข้าเชียงใหม่ไม่ได้', () => expect(canAccessMember('เชียงใหม่', ['ผู้ประสานงานภาค', 'ทีมภาคกลางตะวันตก'])).toBe(false))

  it('isAssigned = true ข้ามทุก permission', () => expect(canAccessMember('เชียงใหม่', [], true)).toBe(true))
  it('isAssigned = true แม้ไม่มียศ',         () => expect(canAccessMember('ราชบุรี', ['Moderator'], true)).toBe(true))
})

// ---- canCreateCampaign ----
describe('canCreateCampaign', () => {
  it('Admin สร้างได้',                 () => expect(canCreateCampaign(['Admin'])).toBe(true))
  it('ผู้ประสานงานภาค สร้างได้',       () => expect(canCreateCampaign(['ผู้ประสานงานภาค'])).toBe(true))
  it('กรรมการจังหวัด สร้างได้',        () => expect(canCreateCampaign(['กรรมการจังหวัด'])).toBe(true))
  it('ผู้ประสานงานจังหวัด สร้างได้',   () => expect(canCreateCampaign(['ผู้ประสานงานจังหวัด'])).toBe(true))
  it('ทีมXXX อย่างเดียว สร้างไม่ได้', () => expect(canCreateCampaign(['ทีมราชบุรี'])).toBe(false))
  it('ไม่มียศ สร้างไม่ได้',            () => expect(canCreateCampaign([])).toBe(false))
})

// ---- canOverrideTier ----
describe('canOverrideTier', () => {
  it('Admin override ได้',      () => expect(canOverrideTier(['Admin'])).toBe(true))
  it('เลขาธิการ override ได้',  () => expect(canOverrideTier(['เลขาธิการ'])).toBe(true))
  it('เหรัญญิก override ได้',   () => expect(canOverrideTier(['เหรัญญิก'])).toBe(true))
  it('กรรมการจังหวัด override ไม่ได้', () => expect(canOverrideTier(['กรรมการจังหวัด'])).toBe(false))
  it('ไม่มียศ override ไม่ได้', () => expect(canOverrideTier([])).toBe(false))
})

// ---- canSeeContacts ----
describe('canSeeContacts', () => {
  it('Admin เห็น contact ได้',                    () => expect(canSeeContacts(['Admin'])).toBe(true))
  it('เลขาธิการเห็น contact ได้',                 () => expect(canSeeContacts(['เลขาธิการ'])).toBe(true))
  it('ผู้ประสานงานภาค เห็น contact ได้',          () => expect(canSeeContacts(['ผู้ประสานงานภาค'])).toBe(true))
  it('กรรมการจังหวัด เห็น contact ได้',           () => expect(canSeeContacts(['กรรมการจังหวัด'])).toBe(true))
  it('ผู้ประสานงานจังหวัด เห็น contact ได้',      () => expect(canSeeContacts(['ผู้ประสานงานจังหวัด'])).toBe(true))
  it('ทีมXXX อย่างเดียว เห็น contact ไม่ได้',    () => expect(canSeeContacts(['ทีมราชบุรี'])).toBe(false))
  it('ทีมXXX อย่างเดียว เห็น contact ไม่ได้ (เชียงใหม่)', () => expect(canSeeContacts(['ทีมเชียงใหม่'])).toBe(false))
  it('ไม่มียศ เห็น contact ไม่ได้',               () => expect(canSeeContacts([])).toBe(false))
})
