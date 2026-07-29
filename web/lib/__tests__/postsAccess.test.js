import { describe, it, expect } from 'vitest'
import * as pa from '../postsAccess.js'

// posts ไม่มี geography scope → ไม่ต้องใช้ fixture rolesToAccess เหมือน calling/finance
// เขียนด้วย permission key ตรงๆ (ป้าย B ใน org_role_defs.permission)
const acc = (...perms) => ({ permissions: new Set(perms) })

const OWNER = 10
const OTHER = 20

const personal = { owner_user_id: OWNER, visibility: 'personal' }
const orgSeries = { owner_user_id: OWNER, visibility: 'org' }

const P = pa.DEFAULT_POSTS_POLICY
const teamRead  = pa.normalizePolicy({ read: 'team', write: 'team', approval: 'required' })
const optional  = pa.normalizePolicy({ read: 'org',  write: 'org',  approval: 'optional' })

// ---- normalizePolicy ----
describe('normalizePolicy', () => {
  it('ไม่เคยตั้ง → default org/org/required', () => {
    expect(pa.normalizePolicy(null)).toEqual({ read: 'org', write: 'org', approval: 'required' })
  })
  it('JSON string ใช้ได้', () => {
    expect(pa.normalizePolicy('{"read":"team","write":"team","approval":"optional"}'))
      .toEqual({ read: 'team', write: 'team', approval: 'optional' })
  })
  it('JSON พัง → default ไม่ throw', () => {
    expect(pa.normalizePolicy('{oops')).toEqual(P)
  })
  it('array → default', () => expect(pa.normalizePolicy('["org"]')).toEqual(P))
  it('ค่าประหลาดรายช่อง → ตกกลับ default เฉพาะช่องนั้น', () => {
    expect(pa.normalizePolicy({ read: 'everyone', write: 'team', approval: 'x' }))
      .toEqual({ read: 'org', write: 'team', approval: 'required' })
  })
})

// ---- personal series ----
describe('personal series — เจ้าของคนเดียว', () => {
  it('เจ้าของอ่านได้',        () => expect(pa.canReadSeries(personal, acc('member'), OWNER, P)).toBe(true))
  it('คนอื่นอ่านไม่ได้',      () => expect(pa.canReadSeries(personal, acc('member'), OTHER, P)).toBe(false))
  it('editor ก็อ่านไม่ได้',   () => expect(pa.canReadSeries(personal, acc('editor'), OTHER, P)).toBe(false))
  it('เลขาธิการอ่านไม่ได้',   () => expect(pa.canReadSeries(personal, acc('secretary_general'), OTHER, P)).toBe(false))
  it('admin อ่านได้ (god-mode)', () => expect(pa.canReadSeries(personal, acc('admin'), OTHER, P)).toBe(true))
  it('policy org ก็ไม่เปิด personal ให้คนอื่น', () => {
    expect(pa.canReadSeries(personal, acc('member'), OTHER, optional)).toBe(false)
  })
  it('เจ้าของแก้ได้',         () => expect(pa.canWriteSeries(personal, acc('member'), OWNER, P)).toBe(true))
  it('editor แก้ไม่ได้',      () => expect(pa.canWriteSeries(personal, acc('editor'), OTHER, P)).toBe(false))
})

// ---- org series · policy read/write = 'org' (default) ----
describe('org series — policy default (ทุกสมาชิกอ่าน/เขียน)', () => {
  it('member อ่านได้',  () => expect(pa.canReadSeries(orgSeries, acc('member'), OTHER, P)).toBe(true))
  it('member แก้ได้',   () => expect(pa.canWriteSeries(orgSeries, acc('member'), OTHER, P)).toBe(true))
  it('เจ้าของแก้ได้',   () => expect(pa.canWriteSeries(orgSeries, acc('member'), OWNER, P)).toBe(true))
})

// ---- org series · policy = 'team' ----
describe('org series — policy team (เฉพาะทีมสื่อ)', () => {
  it('member อ่านไม่ได้',      () => expect(pa.canReadSeries(orgSeries, acc('member'), OTHER, teamRead)).toBe(false))
  it('editor อ่านได้',         () => expect(pa.canReadSeries(orgSeries, acc('editor'), OTHER, teamRead)).toBe(true))
  it('เลขาธิการอ่านได้',       () => expect(pa.canReadSeries(orgSeries, acc('secretary_general'), OTHER, teamRead)).toBe(true))
  it('เจ้าของอ่านได้แม้ไม่มียศ', () => expect(pa.canReadSeries(orgSeries, acc('member'), OWNER, teamRead)).toBe(true))
  it('member แก้ไม่ได้',       () => expect(pa.canWriteSeries(orgSeries, acc('member'), OTHER, teamRead)).toBe(false))
  it('editor แก้ได้',          () => expect(pa.canWriteSeries(orgSeries, acc('editor'), OTHER, teamRead)).toBe(true))

  it('read:team + write:org → คนที่มองไม่เห็นต้องเขียนไม่ได้', () => {
    const mixed = pa.normalizePolicy({ read: 'team', write: 'org', approval: 'required' })
    expect(pa.canReadSeries(orgSeries, acc('member'), OTHER, mixed)).toBe(false)
    expect(pa.canWriteSeries(orgSeries, acc('member'), OTHER, mixed)).toBe(false)
  })
})

// ---- ownership + debug mode ----
describe('userId = null (debug mode / ไม่ล็อกอิน)', () => {
  it('personal อ่านไม่ได้',  () => expect(pa.canReadSeries(personal, acc('member'), null, P)).toBe(false))
  it('org policy team อ่านไม่ได้', () => expect(pa.canReadSeries(orgSeries, acc('member'), null, teamRead)).toBe(false))
  it('admin ยังผ่าน (role-based ไม่ใช่ ownership)', () => expect(pa.canReadSeries(personal, acc('admin'), null, P)).toBe(true))
})

// ---- canApprove ----
describe('canApprove', () => {
  it('editor อนุมัติได้',      () => expect(pa.canApprove(acc('editor'))).toBe(true))
  it('เลขาธิการอนุมัติได้',    () => expect(pa.canApprove(acc('secretary_general'))).toBe(true))
  it('admin อนุมัติได้',       () => expect(pa.canApprove(acc('admin'))).toBe(true))
  it('member อนุมัติไม่ได้',   () => expect(pa.canApprove(acc('member'))).toBe(false))
  it('เหรัญญิกอนุมัติไม่ได้',  () => expect(pa.canApprove(acc('treasurer'))).toBe(false))
})

// ---- ล็อกหลังอนุมัติ ----
describe('canEditEpisode / canRequestChanges', () => {
  const draft = { status: 'draft' }
  const review = { status: 'review' }
  const approved = { status: 'approved' }

  it('draft แก้ได้',    () => expect(pa.canEditEpisode(orgSeries, draft, acc('member'), OTHER, P)).toBe(true))
  it('review แก้ได้',   () => expect(pa.canEditEpisode(orgSeries, review, acc('member'), OTHER, P)).toBe(true))
  it('approved ล็อก แม้เป็น editor', () => expect(pa.canEditEpisode(orgSeries, approved, acc('editor'), OTHER, P)).toBe(false))
  it('approved ล็อก แม้เป็นเจ้าของ', () => expect(pa.canEditEpisode(orgSeries, approved, acc('member'), OWNER, P)).toBe(false))
  it('admin ก็ล็อกเหมือนกัน (ต้องกดขอแก้ก่อน)', () => expect(pa.canEditEpisode(orgSeries, approved, acc('admin'), OTHER, P)).toBe(false))

  it('ขอแก้ได้เมื่อ approved', () => expect(pa.canRequestChanges(orgSeries, approved, acc('member'), OTHER, P)).toBe(true))
  it('draft ไม่มีอะไรให้ขอแก้', () => expect(pa.canRequestChanges(orgSeries, draft, acc('member'), OTHER, P)).toBe(false))
  it('คนที่เขียนไม่ได้ ก็ขอแก้ไม่ได้', () => expect(pa.canRequestChanges(orgSeries, approved, acc('member'), OTHER, teamRead)).toBe(false))
})

// ---- ประตูก่อนโพสต์ ----
describe('canPublishEpisode', () => {
  const draft = { status: 'draft' }
  const approved = { status: 'approved' }

  it('org + required + draft → โพสต์ไม่ได้', () => expect(pa.canPublishEpisode(orgSeries, draft, acc('editor'), OTHER, P)).toBe(false))
  it('org + required + approved → โพสต์ได้',  () => expect(pa.canPublishEpisode(orgSeries, approved, acc('editor'), OTHER, P)).toBe(true))
  it('org + optional + draft → โพสต์ได้',     () => expect(pa.canPublishEpisode(orgSeries, draft, acc('member'), OTHER, optional)).toBe(true))
  it('personal + draft → เจ้าของโพสต์ได้เลย', () => expect(pa.canPublishEpisode(personal, draft, acc('member'), OWNER, P)).toBe(true))
  it('personal ของคนอื่น → ไม่ได้',           () => expect(pa.canPublishEpisode(personal, approved, acc('editor'), OTHER, P)).toBe(false))
  it('เขียนไม่ได้ → โพสต์ไม่ได้แม้ approved',  () => expect(pa.canPublishEpisode(orgSeries, approved, acc('member'), OTHER, teamRead)).toBe(false))
})

// ---- ย้าย personal → org ----
describe('canPromoteToOrg — ทางเดียว มีเงื่อนไข', () => {
  it('เจ้าของ + ยังสะอาด → ได้', () => expect(pa.canPromoteToOrg(personal, acc('member'), OWNER, {})).toBe(true))
  it('มีคอมเมนต์แล้ว → ไม่ได้',  () => expect(pa.canPromoteToOrg(personal, acc('member'), OWNER, { hasComments: true })).toBe(false))
  it('เคยอนุมัติแล้ว → ไม่ได้',  () => expect(pa.canPromoteToOrg(personal, acc('member'), OWNER, { hasApprovals: true })).toBe(false))
  it('มี publish job → ไม่ได้',  () => expect(pa.canPromoteToOrg(personal, acc('member'), OWNER, { hasJobs: true })).toBe(false))
  it('คนอื่นกดไม่ได้',           () => expect(pa.canPromoteToOrg(personal, acc('editor'), OTHER, {})).toBe(false))
  it('ซีรีส์ org อยู่แล้ว → ไม่ได้', () => expect(pa.canPromoteToOrg(orgSeries, acc('admin'), OWNER, {})).toBe(false))
  it('ย้อนกลับ org → personal ไม่มีทาง', () => expect(pa.canDemoteToPersonal()).toBe(false))
})

// ---- ลบ ----
describe('canDeleteSeries', () => {
  it('เจ้าของลบได้',        () => expect(pa.canDeleteSeries(orgSeries, acc('member'), OWNER)).toBe(true))
  it('admin ลบได้',         () => expect(pa.canDeleteSeries(orgSeries, acc('admin'), OTHER)).toBe(true))
  it('editor ลบไม่ได้',     () => expect(pa.canDeleteSeries(orgSeries, acc('editor'), OTHER)).toBe(false))
  it('เลขาธิการลบไม่ได้',   () => expect(pa.canDeleteSeries(orgSeries, acc('secretary_general'), OTHER)).toBe(false))
})

// ---- AI ----
describe('canUseAi', () => {
  it('คนที่เขียนได้ เรียก AI ได้',   () => expect(pa.canUseAi(orgSeries, acc('member'), OTHER, P)).toBe(true))
  it('คนที่อ่านอย่างเดียว เรียกไม่ได้', () => expect(pa.canUseAi(orgSeries, acc('member'), OTHER, teamRead)).toBe(false))
  it('personal ของคนอื่น เรียกไม่ได้', () => expect(pa.canUseAi(personal, acc('editor'), OTHER, P)).toBe(false))
})

// ---- series/episode ที่ไม่มีจริง ----
describe('input ว่าง', () => {
  it('series null → อ่านไม่ได้',  () => expect(pa.canReadSeries(null, acc('admin'), OWNER, P)).toBe(false))
  it('series null → เขียนไม่ได้', () => expect(pa.canWriteSeries(null, acc('admin'), OWNER, P)).toBe(false))
  it('series null → ลบไม่ได้',    () => expect(pa.canDeleteSeries(null, acc('admin'), OWNER)).toBe(false))
})
