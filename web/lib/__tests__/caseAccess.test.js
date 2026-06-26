import { describe, it, expect } from 'vitest'
import * as ca from '../caseAccess.js'

// caseAccess รับ access object { permissions: Set, scopeGrants: [] } ตรงๆ
const acc = (permissions = [], scopeGrants = []) => ({
  isMember: true,
  permissions: new Set(permissions),
  scopeGrants,
})

describe('canManageCases', () => {
  it('caseworker ใช่',          () => expect(ca.canManageCases(acc(['caseworker']))).toBe(true))
  it('admin ใช่',               () => expect(ca.canManageCases(acc(['admin']))).toBe(true))
  it('secretary_general ใช่',   () => expect(ca.canManageCases(acc(['secretary_general']))).toBe(true))
  it('province_coordinator ใช่', () => expect(ca.canManageCases(acc(['province_coordinator']))).toBe(true))
  it('regional_coordinator ใช่', () => expect(ca.canManageCases(acc(['regional_coordinator']))).toBe(true))
  it('member ไม่ใช่',           () => expect(ca.canManageCases(acc(['member']))).toBe(false))
  it('treasurer ไม่ใช่',        () => expect(ca.canManageCases(acc(['treasurer']))).toBe(false))
  it('ไม่มี permission ไม่ใช่',  () => expect(ca.canManageCases(acc([]))).toBe(false))
})

describe('canAccessCaseProvince', () => {
  it('admin เข้าทุกจังหวัด', () =>
    expect(ca.canAccessCaseProvince('ราชบุรี', acc(['admin']))).toBe(true))

  it('caseworker จังหวัดตรง scope → เข้าได้', () =>
    expect(ca.canAccessCaseProvince('ราชบุรี', acc(['caseworker'], ['province:ราชบุรี']))).toBe(true))

  it('caseworker จังหวัดนอก scope → เข้าไม่ได้', () =>
    expect(ca.canAccessCaseProvince('นครปฐม', acc(['caseworker'], ['province:ราชบุรี']))).toBe(false))

  it('caseworker ไม่มี scope เลย → เข้าไม่ได้', () =>
    expect(ca.canAccessCaseProvince('ราชบุรี', acc(['caseworker'], []))).toBe(false))
})

describe('getUserScope (re-export จาก callingAccess)', () => {
  it('admin → null (ทุกจังหวัด)', () =>
    expect(ca.getUserScope(acc(['admin']))).toBe(null))

  it('caseworker → array จังหวัดใน scope', () =>
    expect(ca.getUserScope(acc(['caseworker'], ['province:ราชบุรี']))).toEqual(['ราชบุรี']))
})
