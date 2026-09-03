import { describe, it, expect } from 'vitest'
import * as ka from '../kanbanAccess.js'
import { rolesToAccess } from './_rolesToAccess.js'

// user ทดสอบ — ตัวเลขล้วน (users.id) เพราะ kanban ผูก user_id ไม่ใช่ discord_id
const ALICE = 1   // คนสร้างการ์ด (ไม่ได้รับผิดชอบเอง)
const BOB   = 2   // ผู้รับผิดชอบคนที่ 1
const CAROL = 3   // ผู้รับผิดชอบคนที่ 2 — ⭐ เท่ากับ BOB ทุกอย่าง ไม่มีหัวหน้าแล้ว (เฟส B 2026-09-03)
const DAVE  = 4   // คนนอก อยู่ใน org แต่ไม่เกี่ยวกับการ์ด

const card = (over = {}) => ({
  id: 10,
  org_id: 1,
  ref_no: 42,
  title: 'จัดอีเวนต์ลงพื้นที่',
  status_type: 'doing',
  created_by: ALICE,
  assignee_ids: [BOB, CAROL],
  ...over,
})

const unassigned = () => card({ assignee_ids: [], status_type: 'backlog' })
const acc = (roles = []) => rolesToAccess(roles)

// ---- ref ----
describe('formatRef / parseRef', () => {
  it('42 → KB-42',           () => expect(ka.formatRef(42)).toBe('KB-42'))
  it('KB-42 → 42',           () => expect(ka.parseRef('KB-42')).toBe(42))
  it('kb42 → 42',            () => expect(ka.parseRef('kb42')).toBe(42))
  // ⚠️ ของเก่าที่บอทพิมพ์ลงดิสฯ ก่อนเปลี่ยนคำนำหน้า (2026-08-28) — ข้อความเก่าลบไม่ได้ ต้องรับตลอดไป
  it('K-42 ของเก่า → 42',    () => expect(ka.parseRef('K-42')).toBe(42))
  it('k42 ของเก่า → 42',     () => expect(ka.parseRef('k42')).toBe(42))
  it('เลขล้วน 42 → 42',      () => expect(ka.parseRef('42')).toBe(42))
  it('มีช่องว่าง KB 42 → 42', () => expect(ka.parseRef('KB 42')).toBe(42))
  it('ตัวพิมพ์เล็ก kb-42',    () => expect(ka.parseRef('kb-42')).toBe(42))
  it('ขยะ → null',           () => expect(ka.parseRef('abc')).toBe(null))
  it('MEDIA-42 → null (ไม่รับ ref แบบผูกกระดาน)', () => expect(ka.parseRef('MEDIA-42')).toBe(null))
  it('null → null',          () => expect(ka.parseRef(null)).toBe(null))

  // looksLikeRef — ด่านที่แยก 'KB-100' (ref) ออกจาก '100' (id ภายใน) ในพาธ API/URL
  // ⛔ ถ้าตัวเลขล้วนหลุดเป็น ref เมื่อไหร่ ลิงก์เก่าที่ใช้ id จะเปิดการ์ดผิดใบเงียบๆ
  //    (ของจริงบนฐาน dev: id=100 มี ref_no=83 → คนละใบกับ KB-100 ที่ id=117)
  it('looksLikeRef KB-100 → true',  () => expect(ka.looksLikeRef('KB-100')).toBe(true))
  it('looksLikeRef K-100 → true',   () => expect(ka.looksLikeRef('K-100')).toBe(true))
  it('looksLikeRef 100 → false',    () => expect(ka.looksLikeRef('100')).toBe(false))
  it('looksLikeRef abc → false',    () => expect(ka.looksLikeRef('abc')).toBe(false))
  it('looksLikeRef null → false',   () => expect(ka.looksLikeRef(null)).toBe(false))
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
  it('ผู้รับผิดชอบคนแรกใช่', () => expect(ka.isCardStakeholder(card(), BOB)).toBe(true))
  it('คนสร้างใช่',          () => expect(ka.isCardStakeholder(card(), ALICE)).toBe(true))
  it('ผู้รับผิดชอบคนที่สองใช่', () => expect(ka.isCardStakeholder(card(), CAROL)).toBe(true))
  it('คนนอกไม่ใช่',         () => expect(ka.isCardStakeholder(card(), DAVE)).toBe(false))
  it('userId null ไม่ใช่ (debug mode)', () => expect(ka.isCardStakeholder(card(), null)).toBe(false))
  it('ไม่มีการ์ดไม่ใช่',     () => expect(ka.isCardStakeholder(null, BOB)).toBe(false))
  it('assignee_ids ไม่มีก็ไม่พัง', () => expect(ka.isCardStakeholder(card({ assignee_ids: undefined }), CAROL)).toBe(false))
})

// ---- canViewCard — ก้อน 1 ทุกคนใน org เห็นหมด ----
describe('canViewCard', () => {
  it('คนนอกการ์ดก็เห็น',     () => expect(ka.canViewCard(card(), acc([]), DAVE)).toBe(true))
  it('ไม่มีการ์ด = false',   () => expect(ka.canViewCard(null, acc([]), DAVE)).toBe(false))
})

// ---- canEditCard ----
describe('canEditCard', () => {
  it('ผู้รับผิดชอบแก้ได้',          () => expect(ka.canEditCard(card(), acc([]), BOB)).toBe(true))
  it('คนสร้างแก้ได้',              () => expect(ka.canEditCard(card(), acc([]), ALICE)).toBe(true))
  it('ผู้รับผิดชอบคนที่สองแก้ได้',   () => expect(ka.canEditCard(card(), acc([]), CAROL)).toBe(true))
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
  it('คนนอกรับงานที่ยังไม่มีคนรับได้', () => expect(ka.canClaimCard(unassigned(), acc([]), DAVE)).toBe(true))
  it('คนนอกกดลงมือด้วยกับงานที่มีคนรับแล้วได้', () => expect(ka.canClaimCard(card(), acc([]), DAVE)).toBe(true))
  it('งานเสร็จแล้วรับไม่ได้',     () => expect(ka.canClaimCard(card({ status_type: 'done' }), acc([]), DAVE)).toBe(false))
  it('งานยกเลิกแล้วรับไม่ได้',    () => expect(ka.canClaimCard(card({ status_type: 'cancelled' }), acc([]), DAVE)).toBe(false))
  it('userId null รับไม่ได้ (debug mode)', () => expect(ka.canClaimCard(card(), acc(['Admin']), null)).toBe(false))
})

// ---- canArchiveCard — เข้มกว่า edit: คนสร้าง/admin เท่านั้น ----
describe('canArchiveCard', () => {
  it('คนสร้างเก็บเข้ากรุได้',     () => expect(ka.canArchiveCard(card(), acc([]), ALICE)).toBe(true))
  it('Admin เก็บเข้ากรุได้',      () => expect(ka.canArchiveCard(card(), acc(['Admin']), DAVE)).toBe(true))
  it('ผู้รับผิดชอบเก็บเข้ากรุไม่ได้', () => expect(ka.canArchiveCard(card(), acc([]), BOB)).toBe(false))
  it('ผู้รับผิดชอบคนที่สองเก็บเข้ากรุไม่ได้', () => expect(ka.canArchiveCard(card(), acc([]), CAROL)).toBe(false))
  it('คนนอกเก็บเข้ากรุไม่ได้',    () => expect(ka.canArchiveCard(card(), acc([]), DAVE)).toBe(false))
  it('userId null + ไม่มียศ ไม่ได้', () => expect(ka.canArchiveCard(card(), acc([]), null)).toBe(false))
})

// ---- checkStatusTransition — กติกาที่ไม่ขึ้นกับตัวคน ----
describe('checkStatusTransition', () => {
  it('มีคนรับ → doing ได้',
    () => expect(ka.checkStatusTransition(card(), 'doing')).toEqual({ ok: true, reason: null }))
  it('มีคนรับ → done ได้',
    () => expect(ka.checkStatusTransition(card(), 'done')).toEqual({ ok: true, reason: null }))
  it('ไม่มีคนรับ → doing ไม่ได้ + บอกเหตุผล',
    () => expect(ka.checkStatusTransition(unassigned(), 'doing')).toEqual({ ok: false, reason: 'needAssignee' }))
  it('ไม่มีคนรับ → done ไม่ได้',
    () => expect(ka.checkStatusTransition(unassigned(), 'done')).toEqual({ ok: false, reason: 'needAssignee' }))
  it('ไม่มีคนรับ → backlog ได้ (อยู่ที่เดิม)',
    () => expect(ka.checkStatusTransition(unassigned(), 'backlog')).toEqual({ ok: true, reason: null }))
  // 'cancelled' = ช่อง "กรุ" (พักไว้ รอปัดฝุ่น · 2026-08-17) — งานที่ยังไม่มีใครรับก็พักได้
  // ไม่ต้องบังคับหาคนรับก่อน (invariant ยอมให้ cancelled อยู่แล้ว)
  it('ไม่มีคนรับ → กรุ ได้ (ไม่ต้องหาคนก่อนพัก)',
    () => expect(ka.checkStatusTransition(unassigned(), 'cancelled')).toEqual({ ok: true, reason: null }))
  it('มีคนรับ → กรุ ได้',
    () => expect(ka.checkStatusTransition(card(), 'cancelled')).toEqual({ ok: true, reason: null }))
  it('สถานะที่ระบบไม่รู้จัก → ไม่ได้',
    () => expect(ka.checkStatusTransition(card(), 'blocked')).toEqual({ ok: false, reason: 'unknownStatus' }))
  it('"ติดปัญหา" ไม่ใช่สถานะ เป็นธงบนการ์ด',
    () => expect(ka.STATUS_TYPES).not.toContain('blocked'))
  it('ไม่มีการ์ด → needAssignee',
    () => expect(ka.checkStatusTransition(null, 'doing')).toEqual({ ok: false, reason: 'needAssignee' }))
})

// ---- ค่าคงที่ที่ห้ามเปลี่ยนโดยไม่ตั้งใจ ----
describe('STATUS_TYPES', () => {
  it('มี 6 แบบเป๊ะ (ดีไซน์ห้ามเพิ่ม/ลด)', () => expect(ka.STATUS_TYPES).toHaveLength(6))
  it('ตรงกับ CHECK constraint ใน DB', () =>
    expect(ka.STATUS_TYPES).toEqual(['backlog', 'doing', 'review', 'ready', 'done', 'cancelled']))
  it('CLOSED_STATUS เป็น subset ของ STATUS_TYPES', () =>
    expect(ka.CLOSED_STATUS.every(s => ka.STATUS_TYPES.includes(s))).toBe(true))
})

// ---- การ์ดที่ผูกของจริง (เคส/โพสต์) — ก้อน 4 ----
// ดีไซน์: การ์ดพวกนี้ไม่เก็บสถานะเอง → ลากไม่ได้ ต้องไปเปลี่ยนที่หน้าต้นทาง (user เคาะ 2026-08-24)
//
// ⭐ ผ่อนแล้ว 2026-08-25: **งานสื่อช่วงร่าง** ลากได้ เพราะ post_episodes ไม่มีคำว่า "ยังไม่มีใครลงมือ"
//    ในคำศัพท์ของมัน (มีแค่ draft/review/approved = สถานะบรรณาธิการ) → POST_STATUS คืน NULL ตอน draft
//    แล้วปล่อยให้ kanban ถือช่วงนั้นเอง · เงื่อนไขดูจาก `status_type` ที่คำนวณสดมาแล้ว
//    ไม่ใช่ดู link.source_status ตรงๆ (โพสต์เผยแพร่แล้วแต่ status ยัง draft ต้องถูกกันด้วย)
const linked = (kind = 'case', over = {}) =>
  card({ link: { entity_type: kind, entity_id: 7, is_auto: true, title: 'ไฟทางสาธารณะ' }, ...over })

describe('isLinkedCard', () => {
  it('การ์ดเปล่า → false',        () => expect(ka.isLinkedCard(card())).toBe(false))
  it('ผูกเคส → true',            () => expect(ka.isLinkedCard(linked('case'))).toBe(true))
  it('ผูกโพสต์ → true',           () => expect(ka.isLinkedCard(linked('post'))).toBe(true))
  it('ไม่มีการ์ด → false',        () => expect(ka.isLinkedCard(null)).toBe(false))
  it('link เป็น null → false',    () => expect(ka.isLinkedCard(card({ link: null }))).toBe(false))
})

describe('checkStatusTransition — การ์ดที่ผูกของจริง', () => {
  it('ผูกเคสแล้วลากข้ามกอง → ไม่ได้',
    () => expect(ka.checkStatusTransition(linked('case'), 'done')).toEqual({ ok: false, reason: 'linked' }))
  it('ผูกโพสต์แล้วลากข้ามกอง → ไม่ได้',
    () => expect(ka.checkStatusTransition(linked('post'), 'review')).toEqual({ ok: false, reason: 'linked' }))
  it('ผูกของจริง + ยังไม่มีคนรับ → บอก linked ไม่ใช่ needAssignee (เหตุผลที่ตรงกว่า)',
    () => expect(ka.checkStatusTransition(linked('case', { assignee_ids: [] }), 'doing'))
            .toEqual({ ok: false, reason: 'linked' }))
  it('สถานะมั่ว → ยังตอบ unknownStatus ก่อน (กันค่ามั่วหลุดเข้าไปถึง DB)',
    () => expect(ka.checkStatusTransition(linked('case'), 'ไม่มีจริง')).toEqual({ ok: false, reason: 'unknownStatus' }))
  it('ถอดลิงก์แล้วลากได้ตามปกติ',
    () => expect(ka.checkStatusTransition(card(), 'done')).toEqual({ ok: true, reason: null }))
})

// ---- งานสื่อช่วงร่าง: kanban ถือสถานะเอง (2026-08-25) ----
describe('checkStatusTransition — งานสื่อช่วงร่าง', () => {
  it('ผูกโพสต์ อยู่ "กำลังทำ" → ลากไป "รอทำ" ได้ (ปล่อยงานคืนกอง)',
    () => expect(ka.checkStatusTransition(linked('post'), 'backlog')).toEqual({ ok: true, reason: null }))
  it('ผูกโพสต์ อยู่ "กำลังทำ" → ลากไป "พักไว้" ได้',
    () => expect(ka.checkStatusTransition(linked('post'), 'cancelled')).toEqual({ ok: true, reason: null }))
  it('ผูกโพสต์ อยู่ "รอทำ" + ไม่มีคนรับ → ไป "กำลังทำ" ไม่ได้ (ต้องรับงานก่อน)',
    () => expect(ka.checkStatusTransition(
      linked('post', { status_type: 'backlog', assignee_ids: [] }), 'doing'
    )).toEqual({ ok: false, reason: 'needAssignee' }))
  // ⛔ ต้นทางถือสถานะแล้ว (ส่งตรวจ/อนุมัติ/เผยแพร่) = หมดช่วงที่ kanban มีสิทธิ์
  it('ผูกโพสต์ ที่ส่งตรวจแล้ว → ลากกลับ "กำลังทำ" ไม่ได้',
    () => expect(ka.checkStatusTransition(linked('post', { status_type: 'review' }), 'doing'))
            .toEqual({ ok: false, reason: 'linked' }))
  it('ผูกโพสต์ ที่เผยแพร่แล้ว → ลากออกไม่ได้',
    () => expect(ka.checkStatusTransition(linked('post', { status_type: 'done' }), 'doing'))
            .toEqual({ ok: false, reason: 'linked' }))
  // เคสยังล็อกทั้งหมด — write-through ของเคสเป็นก้อนถัดไป (ต้องผ่าน action ที่แจ้งผู้ร้อง)
  it('ผูกเคส → "รอทำ" ยังลากไม่ได้ (ก้อนถัดไป)',
    () => expect(ka.checkStatusTransition(linked('case'), 'backlog')).toEqual({ ok: false, reason: 'linked' }))
})

describe('isDraggableCard', () => {
  it('การบ้านธรรมดา → ลากได้',        () => expect(ka.isDraggableCard(card())).toBe(true))
  it('งานสื่อช่วงร่าง → ลากได้',       () => expect(ka.isDraggableCard(linked('post'))).toBe(true))
  it('งานสื่อส่งตรวจแล้ว → ลากไม่ได้', () => expect(ka.isDraggableCard(linked('post', { status_type: 'ready' }))).toBe(false))
  it('เคส → ลากไม่ได้',               () => expect(ka.isDraggableCard(linked('case'))).toBe(false))
  it('ไม่มีการ์ด → ลากได้ (ไม่มีลิงก์ให้กัน)', () => expect(ka.isDraggableCard(null)).toBe(true))
})

describe('statusOptionsFor', () => {
  it('การบ้านธรรมดา → ครบ 6 แบบ',
    () => expect(ka.statusOptionsFor(card())).toEqual(ka.STATUS_TYPES))
  it('การ์ดที่ผูกของจริง → เหลือเฉพาะช่วงที่ kanban ถือ',
    () => expect(ka.statusOptionsFor(linked('post'))).toEqual(['backlog', 'doing', 'cancelled']))
  it('ตัวเลือกที่คืนมาต้องเป็น subset ของ STATUS_TYPES เสมอ',
    () => expect(ka.statusOptionsFor(linked('case')).every((s) => ka.STATUS_TYPES.includes(s))).toBe(true))
})

describe('LINK_KIND_LABEL', () => {
  it('ครบทั้ง 2 ชนิดที่ CHECK ใน DB อนุญาต',
    () => expect(Object.keys(ka.LINK_KIND_LABEL).sort()).toEqual(['case', 'post']))
})
