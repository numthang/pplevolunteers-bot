/**
 * postsGuard — ด่านเดียวที่ route ของ posts ใช้โหลด context + ตัดสินสิทธิ์
 *
 * ⛔ 2026-07-29 (เย็น): ไม่มี series แล้ว → เหลือ 2 ตัว **ห้าม query สิทธิ์เอง**:
 *   postsContext()      — แค่ต้อง login + อยู่ใน org (หน้า list / สร้างโพสต์ใหม่ / หมวด)
 *   postContext(id)     — โพสต์ต้องมีจริง + อยู่ org เดียวกับ session + อ่านได้
 *
 * คืน `{ error: Response }` เมื่อจบเกม → route แค่ `if (ctx.error) return ctx.error`
 * ไม่มีสิทธิ์อ่าน = **404 ไม่ใช่ 403** — ร่าง personal ของคนอื่นไม่ควรถูกยืนยันว่ามีอยู่
 */
import { getServerSession } from 'next-auth'
import { authOptions } from './auth-options.js'
import { getEffectiveOrgIdentity } from './orgAccess.js'
import { getOrgId } from './orgContext.js'
import { getOrgConfig } from '@/db/orgConfig.js'
import { normalizePolicy, canReadPost, isAdmin } from './postsAccess.js'
import * as postDB from '@/db/posts/episodes.js'

export const err = (status, message) => Response.json({ error: message }, { status })

/** session + org + access + policy ของ org นั้น */
export async function postsContext() {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.userId
  if (!userId) return { error: err(401, 'ต้องเข้าสู่ระบบก่อน') }

  const orgId = await getOrgId(session)
  if (!orgId) return { error: err(403, 'ยังไม่ได้อยู่ในองค์กรไหน') }

  const { access } = await getEffectiveOrgIdentity(session)
  const policy = normalizePolicy(await getOrgConfig(orgId, 'posts_policy'))
  return { session, userId, orgId, access, policy }
}

export async function postContext(postId) {
  const ctx = await postsContext()
  if (ctx.error) return ctx

  const id = Number(postId)
  const post = Number.isInteger(id) ? await postDB.getPost(id) : null
  // org ไม่ตรง = มองไม่เห็นเลย (กัน id enumeration ข้าม tenant)
  if (!post || post.org_id !== ctx.orgId) return { ...ctx, error: err(404, 'ไม่พบโพสต์') }
  if (!canReadPost(post, ctx.access, ctx.userId, ctx.policy)) return { ...ctx, error: err(404, 'ไม่พบโพสต์') }

  return { ...ctx, post }
}

/** ชื่อคนแก้ที่จะจดลง revision/comment (มีไว้ให้ทุก route ใช้ชื่อเดียวกัน) */
export function editorName(session) {
  const u = session?.user || {}
  return u.name || u.username || u.email || null
}

export { isAdmin }
