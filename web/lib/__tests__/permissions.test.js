/**
 * permissions.test.js — พิสูจน์ว่า capability ใหม่ (แทน name-check ใน step 11)
 * ให้ผลตรงกับ role-name list เดิม โดยแปลงชื่อ role → access ผ่าน fixture
 */
import { describe, it, expect } from 'vitest'
import { can } from '../permissions.js'
import { isAdmin, isEditor } from '../roles.js'
import { rolesToAccess } from './_rolesToAccess.js'

const perms = (names) => rolesToAccess(names).permissions
const allows = (cap, names) => can(cap, perms(names))

describe('isAdmin (admin || secretary_general)', () => {
  it('Admin ใช่',            () => expect(isAdmin(rolesToAccess(['Admin']))).toBe(true))
  it('เลขาธิการ ใช่',        () => expect(isAdmin(rolesToAccess(['เลขาธิการ']))).toBe(true))
  it('Moderator ไม่ใช่',     () => expect(isAdmin(rolesToAccess(['Moderator']))).toBe(false))
  it('เหรัญญิก ไม่ใช่',      () => expect(isAdmin(rolesToAccess(['เหรัญญิก']))).toBe(false))
  it('ไม่มียศ ไม่ใช่',       () => expect(isAdmin(rolesToAccess([]))).toBe(false))
})

describe('isEditor', () => {
  it('ทีมบรรณาธิการ ใช่',    () => expect(isEditor(rolesToAccess(['ทีมบรรณาธิการ']))).toBe(true))
  it('Admin ไม่ใช่',         () => expect(isEditor(rolesToAccess(['Admin']))).toBe(false))
})

describe('editGlobalCategory (เดิม GLOBAL_EDITORS: Admin/เลขาธิการ/Moderator)', () => {
  it('Admin',      () => expect(allows('editGlobalCategory', ['Admin'])).toBe(true))
  it('เลขาธิการ',  () => expect(allows('editGlobalCategory', ['เลขาธิการ'])).toBe(true))
  it('Moderator',  () => expect(allows('editGlobalCategory', ['Moderator'])).toBe(true))
  it('เหรัญญิก ไม่ได้', () => expect(allows('editGlobalCategory', ['เหรัญญิก'])).toBe(false))
  it('ไม่มียศ ไม่ได้',  () => expect(allows('editGlobalCategory', [])).toBe(false))
})

describe('sendBulkSms (เดิม SMS_ROLES: admin/sec/regional/province)', () => {
  it('Admin',              () => expect(allows('sendBulkSms', ['Admin'])).toBe(true))
  it('เลขาธิการ',          () => expect(allows('sendBulkSms', ['เลขาธิการ'])).toBe(true))
  it('ผู้ประสานงานภาค',    () => expect(allows('sendBulkSms', ['ผู้ประสานงานภาค'])).toBe(true))
  it('รองเลขาธิการ',       () => expect(allows('sendBulkSms', ['รองเลขาธิการ'])).toBe(true))
  it('ผู้ประสานงานจังหวัด', () => expect(allows('sendBulkSms', ['ผู้ประสานงานจังหวัด'])).toBe(true))
  it('กรรมการจังหวัด ไม่ได้', () => expect(allows('sendBulkSms', ['กรรมการจังหวัด'])).toBe(false))
  it('Moderator ไม่ได้',   () => expect(allows('sendBulkSms', ['Moderator'])).toBe(false))
})

describe('manageContacts (เดิม MANAGE_ROLES: + กรรมการจังหวัด)', () => {
  it('ผู้ประสานงานจังหวัด', () => expect(allows('manageContacts', ['ผู้ประสานงานจังหวัด'])).toBe(true))
  it('กรรมการจังหวัด',      () => expect(allows('manageContacts', ['กรรมการจังหวัด'])).toBe(true))
  it('Moderator ไม่ได้',   () => expect(allows('manageContacts', ['Moderator'])).toBe(false))
  it('ไม่มียศ ไม่ได้',     () => expect(allows('manageContacts', [])).toBe(false))
})

describe('viewServerLogs (เดิม ["Admin","Moderator"])', () => {
  it('Admin',         () => expect(allows('viewServerLogs', ['Admin'])).toBe(true))
  it('Moderator',     () => expect(allows('viewServerLogs', ['Moderator'])).toBe(true))
  it('เลขาธิการ ไม่ได้', () => expect(allows('viewServerLogs', ['เลขาธิการ'])).toBe(false))
})

describe('deleteLog (เดิม MODERATOR_ROLES: Admin/เลขาธิการ/Moderator)', () => {
  it('Admin',      () => expect(allows('deleteLog', ['Admin'])).toBe(true))
  it('เลขาธิการ',  () => expect(allows('deleteLog', ['เลขาธิการ'])).toBe(true))
  it('Moderator',  () => expect(allows('deleteLog', ['Moderator'])).toBe(true))
  it('เหรัญญิก ไม่ได้', () => expect(allows('deleteLog', ['เหรัญญิก'])).toBe(false))
})

describe('editProvinceAccount (เดิม transactions:255: เหรัญญิก/กรรมการ/ผู้ประสานจว./Admin/เลขาธิการ)', () => {
  it('เหรัญญิก',           () => expect(allows('editProvinceAccount', ['เหรัญญิก'])).toBe(true))
  it('กรรมการจังหวัด',      () => expect(allows('editProvinceAccount', ['กรรมการจังหวัด'])).toBe(true))
  it('ผู้ประสานงานจังหวัด', () => expect(allows('editProvinceAccount', ['ผู้ประสานงานจังหวัด'])).toBe(true))
  it('Admin',              () => expect(allows('editProvinceAccount', ['Admin'])).toBe(true))
  it('เลขาธิการ',          () => expect(allows('editProvinceAccount', ['เลขาธิการ'])).toBe(true))
  it('ผู้ประสานงานภาค ไม่ได้', () => expect(allows('editProvinceAccount', ['ผู้ประสานงานภาค'])).toBe(false))
  it('Moderator ไม่ได้',   () => expect(allows('editProvinceAccount', ['Moderator'])).toBe(false))
})
