import { describe, it, expect } from 'vitest'
import * as pa from '../postsAccess.js'

// posts ไม่มี geography scope → ไม่ต้องใช้ fixture rolesToAccess เหมือน calling/finance
// เขียนด้วย permission key ตรงๆ (ป้าย B ใน org_role_defs.permission)
const acc = (...perms) => ({ permissions: new Set(perms) })

const OWNER = 10
const OTHER = 20

const personal = { created_by: OWNER, visibility: 'personal' }
const orgPost = { created_by: OWNER, visibility: 'org' }

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

// ---- personal post ----
describe('personal post — เจ้าของคนเดียว', () => {
  it('เจ้าของอ่านได้',        () => expect(pa.canReadPost(personal, acc('member'), OWNER, P)).toBe(true))
  it('คนอื่นอ่านไม่ได้',      () => expect(pa.canReadPost(personal, acc('member'), OTHER, P)).toBe(false))
  it('editor ก็อ่านไม่ได้',   () => expect(pa.canReadPost(personal, acc('editor'), OTHER, P)).toBe(false))
  it('เลขาธิการอ่านไม่ได้',   () => expect(pa.canReadPost(personal, acc('secretary_general'), OTHER, P)).toBe(false))
  it('admin อ่านได้ (god-mode)', () => expect(pa.canReadPost(personal, acc('admin'), OTHER, P)).toBe(true))
  it('policy org ก็ไม่เปิด personal ให้คนอื่น', () => {
    expect(pa.canReadPost(personal, acc('member'), OTHER, optional)).toBe(false)
  })
  it('เจ้าของแก้ได้',         () => expect(pa.canWritePost(personal, acc('member'), OWNER, P)).toBe(true))
  it('editor แก้ไม่ได้',      () => expect(pa.canWritePost(personal, acc('editor'), OTHER, P)).toBe(false))
})

// ---- org post · policy read/write = 'org' (default) ----
describe('org post — policy default (ทุกสมาชิกอ่าน/เขียน)', () => {
  it('member อ่านได้',  () => expect(pa.canReadPost(orgPost, acc('member'), OTHER, P)).toBe(true))
  it('member แก้ได้',   () => expect(pa.canWritePost(orgPost, acc('member'), OTHER, P)).toBe(true))
  it('เจ้าของแก้ได้',   () => expect(pa.canWritePost(orgPost, acc('member'), OWNER, P)).toBe(true))
})

// ---- org post · policy = 'team' ----
describe('org post — policy team (เฉพาะทีมสื่อ)', () => {
  it('member อ่านไม่ได้',      () => expect(pa.canReadPost(orgPost, acc('member'), OTHER, teamRead)).toBe(false))
  it('editor อ่านได้',         () => expect(pa.canReadPost(orgPost, acc('editor'), OTHER, teamRead)).toBe(true))
  it('เลขาธิการอ่านได้',       () => expect(pa.canReadPost(orgPost, acc('secretary_general'), OTHER, teamRead)).toBe(true))
  it('เจ้าของอ่านได้แม้ไม่มียศ', () => expect(pa.canReadPost(orgPost, acc('member'), OWNER, teamRead)).toBe(true))
  it('member แก้ไม่ได้',       () => expect(pa.canWritePost(orgPost, acc('member'), OTHER, teamRead)).toBe(false))
  it('editor แก้ได้',          () => expect(pa.canWritePost(orgPost, acc('editor'), OTHER, teamRead)).toBe(true))

  it('read:team + write:org → คนที่มองไม่เห็นต้องเขียนไม่ได้', () => {
    const mixed = pa.normalizePolicy({ read: 'team', write: 'org', approval: 'required' })
    expect(pa.canReadPost(orgPost, acc('member'), OTHER, mixed)).toBe(false)
    expect(pa.canWritePost(orgPost, acc('member'), OTHER, mixed)).toBe(false)
  })
})

// ---- ownership + debug mode ----
describe('userId = null (debug mode / ไม่ล็อกอิน)', () => {
  it('personal อ่านไม่ได้',  () => expect(pa.canReadPost(personal, acc('member'), null, P)).toBe(false))
  it('org policy team อ่านไม่ได้', () => expect(pa.canReadPost(orgPost, acc('member'), null, teamRead)).toBe(false))
  it('admin ยังผ่าน (role-based ไม่ใช่ ownership)', () => expect(pa.canReadPost(personal, acc('admin'), null, P)).toBe(true))
})

// ---- canApprove (เปิดกว้าง 2026-09-05 — ผูกกับ canReadPost ไม่ใช่ isMediaTeam แล้ว) ----
describe('canApprove', () => {
  it('member อนุมัติโพสต์ org ได้ (เปิดกว้างทุกคน)', () => expect(pa.canApprove(orgPost, acc('member'), OTHER, P)).toBe(true))
  it('เหรัญญิกอนุมัติโพสต์ org ได้เหมือนกัน',        () => expect(pa.canApprove(orgPost, acc('treasurer'), OTHER, P)).toBe(true))
  it('editor อนุมัติได้',      () => expect(pa.canApprove(orgPost, acc('editor'), OTHER, P)).toBe(true))
  it('เจ้าของอนุมัติงานตัวเองก็ยังได้ในโค้ด — ห้ามแค่ทางสังคม ไม่ได้บังคับด้วยระบบ', () => {
    expect(pa.canApprove(orgPost, acc('member'), OWNER, P)).toBe(true)
  })
  it('policy read:team → member ที่มองไม่เห็นโพสต์ อนุมัติไม่ได้', () => {
    expect(pa.canApprove(orgPost, acc('member'), OTHER, teamRead)).toBe(false)
  })
  it('personal ของคนอื่น อนุมัติไม่ได้ (มองไม่เห็น)', () => {
    expect(pa.canApprove(personal, acc('editor'), OTHER, P)).toBe(false)
  })
  it('admin เห็น personal ของคนอื่น เลยอนุมัติได้ (god-mode)', () => {
    expect(pa.canApprove(personal, acc('admin'), OTHER, P)).toBe(true)
  })
})

// ---- ล็อกหลังอนุมัติ ----
describe('canEditPost / canRequestChanges', () => {
  const draft = { ...orgPost, status: 'draft' }
  const review = { ...orgPost, status: 'review' }
  const approved = { ...orgPost, status: 'approved' }

  it('draft แก้ได้',    () => expect(pa.canEditPost(draft, acc('member'), OTHER, P)).toBe(true))
  it('review แก้ได้',   () => expect(pa.canEditPost(review, acc('member'), OTHER, P)).toBe(true))
  it('approved ล็อก แม้เป็น editor', () => expect(pa.canEditPost(approved, acc('editor'), OTHER, P)).toBe(false))
  it('approved ล็อก แม้เป็นเจ้าของ', () => expect(pa.canEditPost(approved, acc('member'), OWNER, P)).toBe(false))
  it('admin ก็ล็อกเหมือนกัน (ต้องกดขอแก้ก่อน)', () => expect(pa.canEditPost(approved, acc('admin'), OTHER, P)).toBe(false))

  it('ขอแก้ได้เมื่อ approved', () => expect(pa.canRequestChanges(approved, acc('member'), OTHER, P)).toBe(true))
  it('draft ไม่มีอะไรให้ขอแก้', () => expect(pa.canRequestChanges(draft, acc('member'), OTHER, P)).toBe(false))
  it('คนที่เขียนไม่ได้ ก็ขอแก้ไม่ได้', () => expect(pa.canRequestChanges(approved, acc('member'), OTHER, teamRead)).toBe(false))
})

// ---- ประตูก่อนโพสต์ ----
describe('canPublishPost', () => {
  const draft = { ...orgPost, status: 'draft' }
  const approved = { ...orgPost, status: 'approved' }
  const personalDraft = { ...personal, status: 'draft' }
  const personalApproved = { ...personal, status: 'approved' }

  it('org + required + draft → โพสต์ไม่ได้', () => expect(pa.canPublishPost(draft, acc('editor'), OTHER, P)).toBe(false))
  it('org + required + approved → โพสต์ได้',  () => expect(pa.canPublishPost(approved, acc('editor'), OTHER, P)).toBe(true))
  it('org + optional + draft → โพสต์ได้',     () => expect(pa.canPublishPost(draft, acc('member'), OTHER, optional)).toBe(true))
  it('personal + draft → เจ้าของโพสต์ได้เลย', () => expect(pa.canPublishPost(personalDraft, acc('member'), OWNER, P)).toBe(true))
  it('personal ของคนอื่น → ไม่ได้',           () => expect(pa.canPublishPost(personalApproved, acc('editor'), OTHER, P)).toBe(false))
  it('เขียนไม่ได้ → โพสต์ไม่ได้แม้ approved',  () => expect(pa.canPublishPost(approved, acc('member'), OTHER, teamRead)).toBe(false))
})

// ---- ย้าย personal → org ----
describe('canPromoteToOrg — ทางเดียว มีเงื่อนไข', () => {
  it('เจ้าของ + ยังสะอาด → ได้', () => expect(pa.canPromoteToOrg(personal, acc('member'), OWNER, {})).toBe(true))
  it('มีคอมเมนต์แล้ว → ไม่ได้',  () => expect(pa.canPromoteToOrg(personal, acc('member'), OWNER, { hasComments: true })).toBe(false))
  it('เคยอนุมัติแล้ว → ไม่ได้',  () => expect(pa.canPromoteToOrg(personal, acc('member'), OWNER, { hasApprovals: true })).toBe(false))
  it('มี publish job → ไม่ได้',  () => expect(pa.canPromoteToOrg(personal, acc('member'), OWNER, { hasJobs: true })).toBe(false))
  it('คนอื่นกดไม่ได้',           () => expect(pa.canPromoteToOrg(personal, acc('editor'), OTHER, {})).toBe(false))
  it('โพสต์ org อยู่แล้ว → ไม่ได้', () => expect(pa.canPromoteToOrg(orgPost, acc('admin'), OWNER, {})).toBe(false))
  it('ย้อนกลับ org → personal ไม่มีทาง', () => expect(pa.canDemoteToPersonal()).toBe(false))
})

// ---- ลบ ----
describe('canDeletePost', () => {
  it('เจ้าของลบได้',        () => expect(pa.canDeletePost(orgPost, acc('member'), OWNER)).toBe(true))
  it('admin ลบได้',         () => expect(pa.canDeletePost(orgPost, acc('admin'), OTHER)).toBe(true))
  it('editor ลบไม่ได้',     () => expect(pa.canDeletePost(orgPost, acc('editor'), OTHER)).toBe(false))
  it('เลขาธิการลบไม่ได้',   () => expect(pa.canDeletePost(orgPost, acc('secretary_general'), OTHER)).toBe(false))
})

// ---- AI ----
describe('canUseAi', () => {
  it('คนที่เขียนได้ เรียก AI ได้',   () => expect(pa.canUseAi(orgPost, acc('member'), OTHER, P)).toBe(true))
  it('คนที่อ่านอย่างเดียว เรียกไม่ได้', () => expect(pa.canUseAi(orgPost, acc('member'), OTHER, teamRead)).toBe(false))
  it('personal ของคนอื่น เรียกไม่ได้', () => expect(pa.canUseAi(personal, acc('editor'), OTHER, P)).toBe(false))
})

// ---- post ที่ไม่มีจริง ----
describe('input ว่าง', () => {
  it('post null → อ่านไม่ได้',  () => expect(pa.canReadPost(null, acc('admin'), OWNER, P)).toBe(false))
  it('post null → เขียนไม่ได้', () => expect(pa.canWritePost(null, acc('admin'), OWNER, P)).toBe(false))
  it('post null → ลบไม่ได้',    () => expect(pa.canDeletePost(null, acc('admin'), OWNER)).toBe(false))
})

// ---- category เป็นแค่ป้าย ไม่มีผลต่อสิทธิ์ ----
describe('category ไม่มีผลต่อสิทธิ์', () => {
  const postA = { ...orgPost, category: 'announcement' }
  const postB = { ...orgPost, category: 'event' }

  it('canReadPost ผลเหมือนกันไม่ว่า category ไหน', () => {
    expect(pa.canReadPost(postA, acc('member'), OTHER, teamRead))
      .toBe(pa.canReadPost(postB, acc('member'), OTHER, teamRead))
  })
  it('canWritePost ผลเหมือนกันไม่ว่า category ไหน', () => {
    expect(pa.canWritePost(postA, acc('member'), OTHER, P))
      .toBe(pa.canWritePost(postB, acc('member'), OTHER, P))
  })
  it('personal ต่าง category กัน — เจ้าของอ่านได้เท่ากันทั้งคู่', () => {
    const pA = { ...personal, category: 'announcement' }
    const pB = { ...personal, category: 'event' }
    expect(pa.canReadPost(pA, acc('member'), OWNER, P)).toBe(true)
    expect(pa.canReadPost(pB, acc('member'), OWNER, P)).toBe(true)
  })
})

// ---- canEditPost กับโพสต์ approved ----
describe('canEditPost — approved ล็อกแม้เป็นเจ้าของ', () => {
  it('post.status = approved → เจ้าของแก้ไม่ได้', () => {
    const approvedOwn = { ...orgPost, status: 'approved' }
    expect(pa.canEditPost(approvedOwn, acc('member'), OWNER, P)).toBe(false)
  })
})

// ═══ คลังภาพ (post_assets) — ไม่ผูกกับ posts_policy ═══
const myAsset  = { owner_user_id: OWNER, visibility: 'personal' }
const orgAsset = { owner_user_id: OWNER, visibility: 'org' }

describe('canReadAsset', () => {
  it('กองส่วนตัว — เจ้าของอ่านได้',   () => expect(pa.canReadAsset(myAsset, acc('member'), OWNER)).toBe(true))
  it('กองส่วนตัว — คนอื่นอ่านไม่ได้', () => expect(pa.canReadAsset(myAsset, acc('member'), OTHER)).toBe(false))
  it('กองส่วนตัว — editor ก็ไม่ได้',  () => expect(pa.canReadAsset(myAsset, acc('editor'), OTHER)).toBe(false))
  it('กองส่วนตัว — admin god-mode',   () => expect(pa.canReadAsset(myAsset, acc('admin'), OTHER)).toBe(true))
  it('กองกลาง — ทุกคนใน org อ่านได้', () => expect(pa.canReadAsset(orgAsset, acc('member'), OTHER)).toBe(true))
  it('ไม่มีแถว → false',              () => expect(pa.canReadAsset(null, acc('admin'), OWNER)).toBe(false))
})

describe('canPublishAsset — เลื่อนขึ้นกองกลาง = ทีมสื่อ', () => {
  it('member ไม่ได้',            () => expect(pa.canPublishAsset(acc('member'))).toBe(false))
  it('editor ได้',               () => expect(pa.canPublishAsset(acc('editor'))).toBe(true))
  it('secretary_general ได้',    () => expect(pa.canPublishAsset(acc('secretary_general'))).toBe(true))
  it('admin ได้ (ห้ามเช็ค editor ตรงๆ)', () => expect(pa.canPublishAsset(acc('admin'))).toBe(true))
})

describe('canEditAsset / canDeleteAsset', () => {
  it('ผู้อัปแก้ได้',              () => expect(pa.canEditAsset(myAsset, acc('member'), OWNER)).toBe(true))
  it('คนอื่นแก้ไม่ได้',           () => expect(pa.canEditAsset(myAsset, acc('member'), OTHER)).toBe(false))
  it('ทีมสื่อแก้ของกองกลางได้',   () => expect(pa.canEditAsset(orgAsset, acc('editor'), OTHER)).toBe(true))
  it('ลบได้เท่าที่แก้ได้',        () => expect(pa.canDeleteAsset(orgAsset, acc('member'), OTHER)).toBe(false))
})

describe('canUploadAsset — ใครก็อัปเข้ากองตัวเองได้', () => {
  it('member ได้',                 () => expect(pa.canUploadAsset(acc('member'), OWNER)).toBe(true))
  it('debug mode (userId null) ไม่ได้', () => expect(pa.canUploadAsset(acc('admin'), null)).toBe(false))
})
