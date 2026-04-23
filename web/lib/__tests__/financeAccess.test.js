import { describe, it, expect } from 'vitest'
import { canViewAccount, canEditAccount, canCreateNonPrivateAccount } from '../financeAccess.js'

// ---- helpers ----
const acc = (overrides) => ({
  owner_id: 'owner123',
  visibility: 'internal',
  province: null,
  ...overrides,
})

const ADMIN_ID    = 'admin999'
const OWNER_ID    = 'owner123'
const OTHER_ID    = 'other456'
const RATCHABURI_MEMBER = 'ratchaburi789'

// ---- canCreateNonPrivateAccount ----
describe('canCreateNonPrivateAccount', () => {
  it('Admin สร้าง internal/public ได้',               () => expect(canCreateNonPrivateAccount(['Admin'])).toBe(true))
  it('เลขาธิการสร้าง internal/public ได้',            () => expect(canCreateNonPrivateAccount(['เลขาธิการ'])).toBe(true))
  it('เหรัญญิกสร้าง internal/public ได้',             () => expect(canCreateNonPrivateAccount(['เหรัญญิก'])).toBe(true))
  it('กรรมการจังหวัดสร้าง internal/public ได้',       () => expect(canCreateNonPrivateAccount(['กรรมการจังหวัด'])).toBe(true))
  it('ผู้ประสานงานจังหวัดสร้าง internal/public ได้',  () => expect(canCreateNonPrivateAccount(['ผู้ประสานงานจังหวัด'])).toBe(true))
  it('ผู้ประสานงานภาคสร้าง internal/public ได้',      () => expect(canCreateNonPrivateAccount(['ผู้ประสานงานภาค'])).toBe(true))
  it('รองเลขาธิการสร้าง internal/public ได้',         () => expect(canCreateNonPrivateAccount(['รองเลขาธิการ'])).toBe(true))
  it('Moderator สร้างแค่ private ได้',                () => expect(canCreateNonPrivateAccount(['Moderator'])).toBe(false))
  it('ไม่มียศสร้างแค่ private ได้',                   () => expect(canCreateNonPrivateAccount([])).toBe(false))
})

// ---- canViewAccount ----

describe('canViewAccount — private', () => {
  const a = acc({ visibility: 'private' })

  it('เจ้าของดูได้', () => expect(canViewAccount(a, OWNER_ID, [])).toBe(true))
  it('Admin ดูได้',                    () => expect(canViewAccount(a, OTHER_ID, ['Admin'])).toBe(true))
  it('เลขาธิการดูไม่ได้ (ไม่ใช่เจ้าของ)', () => expect(canViewAccount(a, OTHER_ID, ['เลขาธิการ'])).toBe(false))
  it('คนอื่นดูไม่ได้',                 () => expect(canViewAccount(a, OTHER_ID, [])).toBe(false))
  it('มียศแต่ไม่ใช่เจ้าของ ดูไม่ได้',  () => expect(canViewAccount(a, OTHER_ID, ['เหรัญญิก'])).toBe(false))
})

describe('canViewAccount — public', () => {
  const a = acc({ visibility: 'public' })

  it('ทุกคนดูได้ (ไม่มียศ)', () => expect(canViewAccount(a, OTHER_ID, [])).toBe(true))
  it('ทุกคนดูได้ (มียศ)',    () => expect(canViewAccount(a, OTHER_ID, ['เหรัญญิก'])).toBe(true))
})

describe('canViewAccount — internal, ไม่มีจังหวัด (ส่วนกลาง)', () => {
  const a = acc({ visibility: 'internal', province: null })

  it('เจ้าของดูได้',           () => expect(canViewAccount(a, OWNER_ID, [])).toBe(true))
  it('Admin ดูได้',            () => expect(canViewAccount(a, OTHER_ID, ['Admin'])).toBe(true))
  it('เหรัญญิกดูได้',          () => expect(canViewAccount(a, OTHER_ID, ['เหรัญญิก'])).toBe(true))
  it('กรรมการจังหวัดดูได้',    () => expect(canViewAccount(a, OTHER_ID, ['กรรมการจังหวัด'])).toBe(true))
  it('ผู้ประสานงานภาคดูได้',   () => expect(canViewAccount(a, OTHER_ID, ['ผู้ประสานงานภาค'])).toBe(true))
  it('รองเลขาธิการดูได้',      () => expect(canViewAccount(a, OTHER_ID, ['รองเลขาธิการ'])).toBe(true))
  it('ไม่มียศดูไม่ได้',        () => expect(canViewAccount(a, OTHER_ID, [])).toBe(false))
  it('Moderator ดูไม่ได้',    () => expect(canViewAccount(a, OTHER_ID, ['Moderator'])).toBe(false))
})

describe('canViewAccount — internal + จังหวัดราชบุรี', () => {
  const a = acc({ visibility: 'internal', province: 'ราชบุรี' })

  it('เจ้าของดูได้',                          () => expect(canViewAccount(a, OWNER_ID, [])).toBe(true))
  it('Admin ดูได้',                           () => expect(canViewAccount(a, OTHER_ID, ['Admin'])).toBe(true))
  it('เหรัญญิก + ทีมราชบุรี ดูได้',          () => expect(canViewAccount(a, OTHER_ID, ['เหรัญญิก', 'ทีมราชบุรี'])).toBe(true))
  it('กรรมการจังหวัด + ทีมราชบุรี ดูได้',    () => expect(canViewAccount(a, OTHER_ID, ['กรรมการจังหวัด', 'ทีมราชบุรี'])).toBe(true))
  it('ผู้ประสานงานภาค + ทีมภาคกลาง ดูได้',   () => expect(canViewAccount(a, OTHER_ID, ['ผู้ประสานงานภาค', 'ทีมภาคกลาง'])).toBe(true))
  it('รองเลขาธิการ + ทีมภาคกลาง ดูได้',      () => expect(canViewAccount(a, OTHER_ID, ['รองเลขาธิการ', 'ทีมภาคกลาง'])).toBe(true))
  it('เหรัญญิก แต่ไม่มี team scope ดูไม่ได้', () => expect(canViewAccount(a, OTHER_ID, ['เหรัญญิก'])).toBe(false))
  it('ทีมราชบุรี แต่ไม่มี org role ดูไม่ได้', () => expect(canViewAccount(a, OTHER_ID, ['ทีมราชบุรี'])).toBe(false))
  it('เหรัญญิก + ทีมเชียงใหม่ ดูไม่ได้',     () => expect(canViewAccount(a, OTHER_ID, ['เหรัญญิก', 'ทีมเชียงใหม่'])).toBe(false))
  it('ไม่มียศดูไม่ได้',                       () => expect(canViewAccount(a, OTHER_ID, [])).toBe(false))
  it('null discordId + role ครบ ยังดูได้ (แค่ ownership หาย)', () => expect(canViewAccount(a, null, ['เหรัญญิก', 'ทีมราชบุรี'])).toBe(true))
})

// ---- canEditAccount ----

describe('canEditAccount — ไม่มีจังหวัด (ส่วนกลาง)', () => {
  const a = acc({ province: null })

  it('เจ้าของแก้ได้',          () => expect(canEditAccount(a, OWNER_ID, [])).toBe(true))
  it('Admin แก้ได้',           () => expect(canEditAccount(a, OTHER_ID, ['Admin'])).toBe(true))
  it('เลขาธิการแก้ได้',        () => expect(canEditAccount(a, OTHER_ID, ['เลขาธิการ'])).toBe(true))
  it('เหรัญญิกแก้ได้',         () => expect(canEditAccount(a, OTHER_ID, ['เหรัญญิก'])).toBe(true))
  it('กรรมการจังหวัดแก้ไม่ได้', () => expect(canEditAccount(a, OTHER_ID, ['กรรมการจังหวัด'])).toBe(false))
  it('ผู้ประสานงานภาคแก้ไม่ได้', () => expect(canEditAccount(a, OTHER_ID, ['ผู้ประสานงานภาค'])).toBe(false))
  it('รองเลขาธิการแก้ไม่ได้',   () => expect(canEditAccount(a, OTHER_ID, ['รองเลขาธิการ'])).toBe(false))
  it('ไม่มียศแก้ไม่ได้',        () => expect(canEditAccount(a, OTHER_ID, [])).toBe(false))
  it('null discordId + เหรัญญิก แก้ได้', () => expect(canEditAccount(a, null, ['เหรัญญิก'])).toBe(true))
  it('null discordId + Admin แก้ได้',    () => expect(canEditAccount(a, null, ['Admin'])).toBe(true))
})

describe('canEditAccount — จังหวัดราชบุรี', () => {
  const a = acc({ province: 'ราชบุรี' })

  it('เจ้าของแก้ได้',                          () => expect(canEditAccount(a, OWNER_ID, [])).toBe(true))
  it('Admin แก้ได้',                           () => expect(canEditAccount(a, OTHER_ID, ['Admin'])).toBe(true))
  it('เหรัญญิก + ทีมราชบุรี แก้ได้',          () => expect(canEditAccount(a, OTHER_ID, ['เหรัญญิก', 'ทีมราชบุรี'])).toBe(true))
  it('กรรมการจังหวัด + ทีมราชบุรี แก้ได้',    () => expect(canEditAccount(a, OTHER_ID, ['กรรมการจังหวัด', 'ทีมราชบุรี'])).toBe(true))
  it('ผู้ประสานงานจังหวัด + ทีมราชบุรี แก้ได้', () => expect(canEditAccount(a, OTHER_ID, ['ผู้ประสานงานจังหวัด', 'ทีมราชบุรี'])).toBe(true))
  it('ผู้ประสานงานภาค + ทีมราชบุรี แก้ไม่ได้', () => expect(canEditAccount(a, OTHER_ID, ['ผู้ประสานงานภาค', 'ทีมราชบุรี'])).toBe(false))
  it('รองเลขาธิการ + ทีมราชบุรี แก้ไม่ได้',   () => expect(canEditAccount(a, OTHER_ID, ['รองเลขาธิการ', 'ทีมราชบุรี'])).toBe(false))
  it('เหรัญญิก ไม่มี team แก้ไม่ได้',          () => expect(canEditAccount(a, OTHER_ID, ['เหรัญญิก'])).toBe(false))
  it('เหรัญญิก + ทีมเชียงใหม่ แก้ไม่ได้',     () => expect(canEditAccount(a, OTHER_ID, ['เหรัญญิก', 'ทีมเชียงใหม่'])).toBe(false))
  it('ไม่มียศแก้ไม่ได้',                       () => expect(canEditAccount(a, OTHER_ID, [])).toBe(false))
  it('null discordId + เหรัญญิก+ทีมราชบุรี แก้ได้', () => expect(canEditAccount(a, null, ['เหรัญญิก', 'ทีมราชบุรี'])).toBe(true))
  it('null discordId + ไม่มียศ แก้ไม่ได้',         () => expect(canEditAccount(a, null, [])).toBe(false))
})
