import { describe, it, expect } from 'vitest'
import * as ka from '../kanbanAccess.js'
import { rolesToAccess } from './_rolesToAccess.js'

// user ทดสอบ — ตัวเลขล้วน (users.id) เพราะ kanban ผูก user_id ไม่ใช่ discord_id
const ALICE = 1   // คนสร้างการ์ด
const BOB   = 2   // เจ้าภาพ
const CAROL = 3   // คนช่วย
const DAVE  = 4   // คนนอก อยู่ใน org แต่ไม่เกี่ยวกับการ์ด

const card = (over = {}) => ({
  id: 10,
  org_id: 1,
  ref_no: 42,
  title: 'จัดอีเวนต์ลงพื้นที่',
  status_type: 'doing',
  owner_user_id: BOB,
  created_by: ALICE,
  helper_ids: [CAROL],
  ...over,
})

const noOwner = () => card({ owner_user_id: null, status_type: 'backlog' })
const acc = (roles = []) => rolesToAccess(roles)

// ---- ref ----
describe('formatRef / parseRef', () => {
  it('42 → K-42',            () => expect(ka.formatRef(42)).toBe('K-42'))
  it('K-42 → 42',            () => expect(ka.parseRef('K-42')).toBe(42))
  it('k42 → 42',             () => expect(ka.parseRef('k42')).toBe(42))
  it('เลขล้วน 42 → 42',      () => expect(ka.parseRef('42')).toBe(42))
  it('มีช่องว่าง K 42 → 42',  () => expect(ka.parseRef('K 42')).toBe(42))
  it('ตัวพิมพ์เล็ก k-42',     () => expect(ka.parseRef('k-42')).toBe(42))
  it('ขยะ → null',           () => expect(ka.parseRef('abc')).toBe(null))
  it('MEDIA-42 → null (ไม่รับ ref แบบผูกกระดาน)', () => expect(ka.parseRef('MEDIA-42')).toBe(null))
  it('null → null',          () => expect(ka.parseRef(null)).toBe(null))
  it('ว่าง → null',          () => expect(ka.parseRef('')).toBe(null))
  it('ไป-กลับได้ค่าเดิม',     () => expect(ka.parseRef(ka.formatRef(7))).toBe(7))
})

// ---- isKanbanAdmin ----
describe('isKanbanAdmin', () => {
  it('Admin ใช่',              () => expect(ka.isKanbanAdmin(acc(['Admin']))).toBe(true))
  it('เลขาธิการใช่',           () => expect(ka.isKanbanAdmin(acc(['เลขาธิการ']))).toBe(true))
  it('ทีมบรรณาธิการไม่ใช่',     () => expect(ka.isKanbanAdmin(acc(['ทีมบรรณาธิการ']))).toBe(false))
  it('ผู้ประสานงานภาคไม่ใช่',   () => expect(ka.isKanbanAdmin(acc(['ผู้ประสานงานภาค']))).toBe(false))
  it('ไม่มียศไม่ใช่',           () => expect(ka.isKanbanAdmin(acc([]))).toBe(false))
  it('ไม่ส่ง access ไม่ใช่',    () => expect(ka.isKanbanAdmin()).toBe(false))
})

// ---- isCardStakeholder ----
describe('isCardStakeholder', () => {
  it('เจ้าภาพใช่',          () => expect(ka.isCardStakeholder(card(), BOB)).toBe(true))
  it('คนสร้างใช่',          () => expect(ka.isCardStakeholder(card(), ALICE)).toBe(true))
  it('คนช่วยใช่',           () => expect(ka.isCardStakeholder(card(), CAROL)).toBe(true))
  it('คนนอกไม่ใช่',         () => expect(ka.isCardStakeholder(card(), DAVE)).toBe(false))
  it('userId null ไม่ใช่ (debug mode)', () => expect(ka.isCardStakeholder(card(), null)).toBe(false))
  it('ไม่มีการ์ดไม่ใช่',     () => expect(ka.isCardStakeholder(null, BOB)).toBe(false))
  it('helper_ids ไม่มีก็ไม่พัง', () => expect(ka.isCardStakeholder(card({ helper_ids: undefined }), CAROL)).toBe(false))
})

// ---- canViewCard — ก้อน 1 ทุกคนใน org เห็นหมด ----
describe('canViewCard', () => {
  it('คนนอกการ์ดก็เห็น',     () => expect(ka.canViewCard(card(), acc([]), DAVE)).toBe(true))
  it('ไม่มีการ์ด = false',   () => expect(ka.canViewCard(null, acc([]), DAVE)).toBe(false))
})

// ---- canEditCard ----
describe('canEditCard', () => {
  it('เจ้าภาพแก้ได้',              () => expect(ka.canEditCard(card(), acc([]), BOB)).toBe(true))
  it('คนสร้างแก้ได้',              () => expect(ka.canEditCard(card(), acc([]), ALICE)).toBe(true))
  it('คนช่วยแก้ได้',               () => expect(ka.canEditCard(card(), acc([]), CAROL)).toBe(true))
  it('คนนอกแก้ไม่ได้',             () => expect(ka.canEditCard(card(), acc([]), DAVE)).toBe(false))
  it('Admin แก้การ์ดคนอื่นได้',     () => expect(ka.canEditCard(card(), acc(['Admin']), DAVE)).toBe(true))
  it('เลขาธิการแก้การ์ดคนอื่นได้',  () => expect(ka.canEditCard(card(), acc(['เลขาธิการ']), DAVE)).toBe(true))
  it('ทีมบรรณาธิการแก้การ์ดคนอื่นไม่ได้', () => expect(ka.canEditCard(card(), acc(['ทีมบรรณาธิการ']), DAVE)).toBe(false))
  it('debug mode: ยศ admin แต่ userId null ยังแก้ได้ (ยศไม่ใช่ ownership)',
    () => expect(ka.canEditCard(card(), acc(['Admin']), null)).toBe(true))
  it('debug mode: ไม่มียศ + userId null แก้ไม่ได้',
    () => expect(ka.canEditCard(card(), acc([]), null)).toBe(false))
})

// ---- canClaimCard — ใครก็ได้ใน org อาสาทำเองได้ ----
describe('canClaimCard', () => {
  it('คนนอกรับงานที่ไม่มีเจ้าภาพได้', () => expect(ka.canClaimCard(noOwner(), acc([]), DAVE)).toBe(true))
  it('คนนอกกดลงมือด้วยกับงานที่มีเจ้าภาพแล้วได้', () => expect(ka.canClaimCard(card(), acc([]), DAVE)).toBe(true))
  it('งานเสร็จแล้วรับไม่ได้',     () => expect(ka.canClaimCard(card({ status_type: 'done' }), acc([]), DAVE)).toBe(false))
  it('งานยกเลิกแล้วรับไม่ได้',    () => expect(ka.canClaimCard(card({ status_type: 'cancelled' }), acc([]), DAVE)).toBe(false))
  it('userId null รับไม่ได้ (debug mode)', () => expect(ka.canClaimCard(card(), acc(['Admin']), null)).toBe(false))
})

// ---- canArchiveCard — เข้มกว่า edit: คนสร้าง/admin เท่านั้น ----
describe('canArchiveCard', () => {
  it('คนสร้างเก็บเข้ากรุได้',     () => expect(ka.canArchiveCard(card(), acc([]), ALICE)).toBe(true))
  it('Admin เก็บเข้ากรุได้',      () => expect(ka.canArchiveCard(card(), acc(['Admin']), DAVE)).toBe(true))
  it('เจ้าภาพเก็บเข้ากรุไม่ได้',   () => expect(ka.canArchiveCard(card(), acc([]), BOB)).toBe(false))
  it('คนช่วยเก็บเข้ากรุไม่ได้',    () => expect(ka.canArchiveCard(card(), acc([]), CAROL)).toBe(false))
  it('คนนอกเก็บเข้ากรุไม่ได้',    () => expect(ka.canArchiveCard(card(), acc([]), DAVE)).toBe(false))
  it('userId null + ไม่มียศ ไม่ได้', () => expect(ka.canArchiveCard(card(), acc([]), null)).toBe(false))
})

// ---- checkStatusTransition — กติกาที่ไม่ขึ้นกับตัวคน ----
describe('checkStatusTransition', () => {
  it('มีเจ้าภาพ → doing ได้',
    () => expect(ka.checkStatusTransition(card(), 'doing')).toEqual({ ok: true, reason: null }))
  it('มีเจ้าภาพ → done ได้',
    () => expect(ka.checkStatusTransition(card(), 'done')).toEqual({ ok: true, reason: null }))
  it('ไม่มีเจ้าภาพ → doing ไม่ได้ + บอกเหตุผล',
    () => expect(ka.checkStatusTransition(noOwner(), 'doing')).toEqual({ ok: false, reason: 'needOwner' }))
  it('ไม่มีเจ้าภาพ → done ไม่ได้',
    () => expect(ka.checkStatusTransition(noOwner(), 'done')).toEqual({ ok: false, reason: 'needOwner' }))
  it('ไม่มีเจ้าภาพ → backlog ได้ (อยู่ที่เดิม)',
    () => expect(ka.checkStatusTransition(noOwner(), 'backlog')).toEqual({ ok: true, reason: null }))
  // 'cancelled' = ช่อง "กรุ" (พักไว้ รอปัดฝุ่น · 2026-08-17) — งานที่ยังไม่มีใครรับก็พักได้
  // ไม่ต้องบังคับหาเจ้าภาพก่อน (DB CHECK ผ่อนให้แล้วใน migration วันเดียวกัน)
  it('ไม่มีเจ้าภาพ → กรุ ได้ (ไม่ต้องหาเจ้าภาพก่อนพัก)',
    () => expect(ka.checkStatusTransition(noOwner(), 'cancelled')).toEqual({ ok: true, reason: null }))
  it('มีเจ้าภาพ → กรุ ได้',
    () => expect(ka.checkStatusTransition(card(), 'cancelled')).toEqual({ ok: true, reason: null }))
  it('สถานะที่ระบบไม่รู้จัก → ไม่ได้',
    () => expect(ka.checkStatusTransition(card(), 'blocked')).toEqual({ ok: false, reason: 'unknownStatus' }))
  it('"ติดปัญหา" ไม่ใช่สถานะ เป็นธงบนการ์ด',
    () => expect(ka.STATUS_TYPES).not.toContain('blocked'))
  it('ไม่มีการ์ด → needOwner',
    () => expect(ka.checkStatusTransition(null, 'doing')).toEqual({ ok: false, reason: 'needOwner' }))
})

// ---- ค่าคงที่ที่ห้ามเปลี่ยนโดยไม่ตั้งใจ ----
describe('STATUS_TYPES', () => {
  it('มี 6 แบบเป๊ะ (ดีไซน์ห้ามเพิ่ม/ลด)', () => expect(ka.STATUS_TYPES).toHaveLength(6))
  it('ตรงกับ CHECK constraint ใน DB', () =>
    expect(ka.STATUS_TYPES).toEqual(['backlog', 'doing', 'review', 'ready', 'done', 'cancelled']))
  it('CLOSED_STATUS เป็น subset ของ STATUS_TYPES', () =>
    expect(ka.CLOSED_STATUS.every(s => ka.STATUS_TYPES.includes(s))).toBe(true))
})
