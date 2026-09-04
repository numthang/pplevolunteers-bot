import { describe, it, expect } from 'vitest'
import * as ca from '../caseAccess.js'

// caseAccess รับ access object { permissions: Set, scopeGrants: [] } ตรงๆ
// ⭐ เคาะ 2026-09-04: ทุกคนใน org เท่ากันหมด — ไม่มี caseworker tier / scope จังหวัดแยกแล้ว
const acc = (permissions = [], scopeGrants = []) => ({
  isMember: true,
  permissions: new Set(permissions),
  scopeGrants,
})

describe('canManageCases — เปิดให้ทุกคนใน org', () => {
  it('admin ใช่',              () => expect(ca.canManageCases(acc(['admin']))).toBe(true))
  it('member ก็ใช่',           () => expect(ca.canManageCases(acc(['member']))).toBe(true))
  it('ไม่มี permission เลยก็ใช่', () => expect(ca.canManageCases(acc([]))).toBe(true))
})

describe('canAccessCaseProvince — ไม่จำกัดจังหวัดแล้ว', () => {
  it('member เข้าได้ทุกจังหวัด แม้ไม่มี scope', () =>
    expect(ca.canAccessCaseProvince('ราชบุรี', acc(['member'], []))).toBe(true))

  it('เข้าจังหวัดที่ไม่มีใน scopeGrants ได้เหมือนกัน', () =>
    expect(ca.canAccessCaseProvince('นครปฐม', acc(['member'], ['ราชบุรี']))).toBe(true))
})

describe('getUserScope — คืน null เสมอ (ไม่จำกัดจังหวัด)', () => {
  it('admin → null', () => expect(ca.getUserScope(acc(['admin']))).toBe(null))
  it('member ไม่มี scope → null เหมือนกัน', () => expect(ca.getUserScope(acc(['member'], []))).toBe(null))
})
