/**
 * Posts Access Control — เครื่องมืองานสื่อ (spec: md/posts/POSTS.md §ผ่าน /grill)
 *
 * ต่างจาก finance/calling: posts **ไม่มี geography scope** — ไม่มีการ ∩ จังหวัด
 * สิทธิ์มาจาก 2 ทางเท่านั้น: permission ของ user + `posts_policy` ของ org
 *
 * policy (org_config key `posts_policy`) — เคาะ /grill ข้อ 3-4:
 *   { read: 'org'|'team', write: 'org'|'team', approval: 'required'|'optional' }
 *   'org'  = ทุกคนในองค์กร (default — user เคาะเอง ยอมรับว่าร่างรั่วออกได้)
 *   'team' = เจ้าของ + editor + secretary_general + admin
 *
 * ⚠️ ซีรีส์ `personal` ไม่ขึ้นกับ policy เลย — เจ้าของคนเดียว (+ admin god-mode)
 *    `secretary_general` ดู private ของคนอื่นไม่ได้ (ตามนิยามใน org_roles)
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

function isOwner(series, userId) {
  return !!userId && !!series && series.owner_user_id === userId
}

function passesScope(scope, series, access, userId) {
  if (scope === 'team') return isOwner(series, userId) || isMediaTeam(access)
  return true   // 'org' — ทุกคนในองค์กร (caller ยืนยัน org แล้วผ่าน session)
}

/**
 * อ่านซีรีส์ได้ไหม
 * @param {{owner_user_id:number, visibility:'personal'|'org'}} series
 * @param {{permissions:Set<string>|string[]}} access
 * @param {number|null} userId  users.id
 * @param {object} policy  ผ่าน normalizePolicy มาแล้ว
 */
export function canReadSeries(series, access, userId, policy = DEFAULT_POSTS_POLICY) {
  if (!series) return false
  if (isAdmin(access)) return true
  if (series.visibility === 'personal') return isOwner(series, userId)
  return passesScope(policy.read, series, access, userId)
}

/** แก้เนื้อหาในซีรีส์ได้ไหม (ยังไม่นับสถานะตอน — ดู canEditEpisode) */
export function canWriteSeries(series, access, userId, policy = DEFAULT_POSTS_POLICY) {
  if (!series) return false
  if (isAdmin(access)) return true
  if (series.visibility === 'personal') return isOwner(series, userId)
  // เขียนได้ต้องอ่านได้ก่อน — org ที่ตั้ง read:'team' + write:'org' ไม่ควรเปิดช่องให้คนที่มองไม่เห็นเขียนได้
  if (!canReadSeries(series, access, userId, policy)) return false
  return passesScope(policy.write, series, access, userId)
}

/** ลบถาวร/เก็บเข้ากรุทั้งซีรีส์ = เจ้าของหรือ admin เท่านั้น (grill ข้อ 6) */
export function canDeleteSeries(series, access, userId) {
  if (!series) return false
  return isAdmin(access) || isOwner(series, userId)
}

/**
 * แก้ตอนได้ไหม — approved = ล็อก ต้องกด "ขอแก้" (canRequestChanges) ให้กลับเป็น review ก่อน
 * published ไม่ล็อก: แก้ได้ในระบบแต่ไม่ sync กลับแพลตฟอร์ม (grill ข้อ 9) — สถานะเผยแพร่อยู่ที่ jobs ไม่ใช่ที่นี่
 */
export function canEditEpisode(series, episode, access, userId, policy = DEFAULT_POSTS_POLICY) {
  if (!canWriteSeries(series, access, userId, policy)) return false
  return episode?.status !== 'approved'
}

/** ปลดล็อกตอนที่อนุมัติแล้วกลับไป review */
export function canRequestChanges(series, episode, access, userId, policy = DEFAULT_POSTS_POLICY) {
  if (episode?.status !== 'approved') return false
  return canWriteSeries(series, access, userId, policy)
}

/**
 * สร้าง publish job ได้ไหม (grill ข้อ 11)
 *   personal → เจ้าของโพสต์ได้เลย ไม่มีขั้นอนุมัติ
 *   org      → policy.approval === 'required' ต้อง approved ก่อน
 */
export function canPublishEpisode(series, episode, access, userId, policy = DEFAULT_POSTS_POLICY) {
  if (!canWriteSeries(series, access, userId, policy)) return false
  if (series.visibility === 'personal') return true
  if (policy.approval === 'optional') return true
  return episode?.status === 'approved'
}

/**
 * เปิดซีรีส์ส่วนตัวให้ทีมเห็น — ทางเดียว มีเงื่อนไข (grill ข้อ 1)
 * @param {{hasComments?:boolean, hasApprovals?:boolean, hasJobs?:boolean}} usage
 */
export function canPromoteToOrg(series, access, userId, usage = {}) {
  if (!series || series.visibility !== 'personal') return false
  if (!isOwner(series, userId) && !isAdmin(access)) return false
  return !usage.hasComments && !usage.hasApprovals && !usage.hasJobs
}

/** ไม่มีทางกลับ — org → personal ทำไม่ได้ (คอมเมนต์/revision ของคนอื่นผูกอยู่แล้ว) ใช้ "ก๊อปเป็นซีรีส์ใหม่" แทน */
export function canDemoteToPersonal() {
  return false
}

/** เรียก AI ได้ = คนที่เขียนซีรีส์นี้ได้เท่านั้น (โควตาต่อวันเช็คแยกที่ชั้น API — grill ข้อ 13) */
export function canUseAi(series, access, userId, policy = DEFAULT_POSTS_POLICY) {
  return canWriteSeries(series, access, userId, policy)
}

export const AI_DAILY_LIMIT = 30
