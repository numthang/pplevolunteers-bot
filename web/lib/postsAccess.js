/**
 * Posts Access Control — เครื่องมืองานสื่อ (spec: md/posts/POSTS.md §ผ่าน /grill)
 *
 * ⛔ 2026-07-29 (เย็น): **ไม่มี series แล้ว** — หน่วยเดียวที่ตัดสินสิทธิ์คือ "โพสต์" (post_episodes)
 *    แต่ละโพสต์ถือ visibility/owner_user_id ของตัวเอง · `category` เป็นแค่ป้ายจัดกลุ่ม **ไม่มีผลต่อสิทธิ์เลย**
 *
 * ต่างจาก finance/calling: posts **ไม่มี geography scope** — ไม่มีการ ∩ จังหวัด
 * สิทธิ์มาจาก 2 ทางเท่านั้น: permission ของ user + `posts_policy` ของ org
 *
 * policy (org_config key `posts_policy`) — เคาะ /grill ข้อ 3-4:
 *   { read: 'org'|'team', write: 'org'|'team', approval: 'required'|'optional' }
 *   'org'  = ทุกคนในองค์กร (default — user เคาะเอง ยอมรับว่าร่างรั่วออกได้)
 *   'team' = เจ้าของ + editor + secretary_general + admin
 *
 * ⚠️ โพสต์ `personal` ไม่ขึ้นกับ policy เลย — เจ้าของคนเดียว (+ admin god-mode)
 *    `secretary_general` ดู personal ของคนอื่นไม่ได้ (ตามนิยามใน `org_roles`)
 *
 * ⚠️ userId = users.id ของ session · debug mode ("View as role") ส่ง null มา →
 *    ownership check ตกทั้งหมดโดยตั้งใจ เหมือน gotcha ใน CLAUDE.md
 */

import { normalizeAccess } from './roleAccess.js'

export const DEFAULT_POSTS_POLICY = { read: 'org', write: 'org', approval: 'required' }

const SCOPES = ['org', 'team']
const APPROVALS = ['required', 'optional']

/** ทีมสื่อ = คนที่แก้/อนุมัติได้เสมอไม่ว่า policy จะตั้งยังไง */
function isMediaTeam(access) {
  const p = normalizeAccess(access).permissions
  return p.has('admin') || p.has('secretary_general') || p.has('editor')
}

/** god-mode — เห็น personal ของคนอื่นได้ตัวเดียวในระบบ */
export function isAdmin(access) {
  return normalizeAccess(access).permissions.has('admin')
}

/** อนุมัติได้ = บรรณาธิการขึ้นไป (เจ้าของอนุมัติงานตัวเองไม่ได้) */
export function canApprove(access) {
  return isMediaTeam(access)
}

/**
 * policy ของ org — รับค่าดิบจาก getOrgConfig(orgId, 'posts_policy') แล้วคืนของที่ใช้ได้เสมอ
 * ค่าเพี้ยน/parse ไม่ได้ → default (ไม่ throw — หน้าเว็บต้องไม่ล่มเพราะ config เสีย)
 */
export function normalizePolicy(raw) {
  let obj = raw
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw) } catch { return { ...DEFAULT_POSTS_POLICY } }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ...DEFAULT_POSTS_POLICY }
  return {
    read:     SCOPES.includes(obj.read)         ? obj.read     : DEFAULT_POSTS_POLICY.read,
    write:    SCOPES.includes(obj.write)        ? obj.write    : DEFAULT_POSTS_POLICY.write,
    approval: APPROVALS.includes(obj.approval)  ? obj.approval : DEFAULT_POSTS_POLICY.approval,
  }
}

function isOwner(post, userId) {
  return !!userId && !!post && post.owner_user_id === userId
}

function passesScope(scope, post, access, userId) {
  if (scope === 'team') return isOwner(post, userId) || isMediaTeam(access)
  return true   // 'org' — ทุกคนในองค์กร (caller ยืนยัน org แล้วผ่าน session)
}

/**
 * อ่านโพสต์ได้ไหม
 * @param {{owner_user_id:number, visibility:'personal'|'org'}} post
 * @param {{permissions:Set<string>|string[]}} access
 * @param {number|null} userId  users.id
 * @param {object} policy  ผ่าน normalizePolicy มาแล้ว
 */
export function canReadPost(post, access, userId, policy = DEFAULT_POSTS_POLICY) {
  if (!post) return false
  if (isAdmin(access)) return true
  if (post.visibility === 'personal') return isOwner(post, userId)
  return passesScope(policy.read, post, access, userId)
}

/** แก้เนื้อหาโพสต์ได้ไหม **โดยยังไม่นับสถานะ** — ตัวที่ route ควรใช้จริงคือ canEditPost */
export function canWritePost(post, access, userId, policy = DEFAULT_POSTS_POLICY) {
  if (!post) return false
  if (isAdmin(access)) return true
  if (post.visibility === 'personal') return isOwner(post, userId)
  // เขียนได้ต้องอ่านได้ก่อน — org ที่ตั้ง read:'team' + write:'org' ไม่ควรเปิดช่องให้คนที่มองไม่เห็นเขียนได้
  if (!canReadPost(post, access, userId, policy)) return false
  return passesScope(policy.write, post, access, userId)
}

/**
 * แก้โพสต์ได้ไหม (ของจริงที่ route ใช้) — approved = ล็อก ต้องกด "ขอแก้" (canRequestChanges) ก่อน
 * published ไม่ล็อก: แก้ได้ในระบบแต่ไม่ sync กลับแพลตฟอร์ม (grill ข้อ 9)
 * — สถานะเผยแพร่อยู่ที่ post_social_history ไม่ใช่ที่นี่
 */
export function canEditPost(post, access, userId, policy = DEFAULT_POSTS_POLICY) {
  if (!canWritePost(post, access, userId, policy)) return false
  return post?.status !== 'approved'
}

/** ลบถาวร/เก็บเข้ากรุ = เจ้าของหรือ admin เท่านั้น (grill ข้อ 6) */
export function canDeletePost(post, access, userId) {
  if (!post) return false
  return isAdmin(access) || isOwner(post, userId)
}

/** ปลดล็อกโพสต์ที่อนุมัติแล้วกลับไป review */
export function canRequestChanges(post, access, userId, policy = DEFAULT_POSTS_POLICY) {
  if (post?.status !== 'approved') return false
  return canWritePost(post, access, userId, policy)
}

/**
 * สร้าง publish job ได้ไหม (grill ข้อ 11)
 *   personal → เจ้าของโพสต์ได้เลย ไม่มีขั้นอนุมัติ
 *   org      → policy.approval === 'required' ต้อง approved ก่อน
 */
export function canPublishPost(post, access, userId, policy = DEFAULT_POSTS_POLICY) {
  if (!canWritePost(post, access, userId, policy)) return false
  if (post.visibility === 'personal') return true
  if (policy.approval === 'optional') return true
  return post?.status === 'approved'
}

/**
 * เปิดโพสต์ส่วนตัวให้ทีมเห็น — ทางเดียว มีเงื่อนไข (grill ข้อ 1)
 * @param {{hasComments?:boolean, hasApprovals?:boolean, hasJobs?:boolean}} usage
 */
export function canPromoteToOrg(post, access, userId, usage = {}) {
  if (!post || post.visibility !== 'personal') return false
  if (!isOwner(post, userId) && !isAdmin(access)) return false
  return !usage.hasComments && !usage.hasApprovals && !usage.hasJobs
}

/** ไม่มีทางกลับ — org → personal ทำไม่ได้ (คอมเมนต์/revision ของคนอื่นผูกอยู่แล้ว) ใช้ "ก๊อปเป็นโพสต์ใหม่" แทน */
export function canDemoteToPersonal() {
  return false
}

/**
 * เรียก AI ได้ = คนที่เขียนโพสต์นี้ได้เท่านั้น (โควตาต่อวันเช็คแยกที่ชั้น API — grill ข้อ 13)
 * ตอนสร้างโพสต์ใหม่ยังไม่มีแถวจริง → ส่ง `{ visibility, owner_user_id: userId }` เข้ามาได้
 */
export function canUseAi(post, access, userId, policy = DEFAULT_POSTS_POLICY) {
  return canWritePost(post, access, userId, policy)
}

export const AI_DAILY_LIMIT = 30
