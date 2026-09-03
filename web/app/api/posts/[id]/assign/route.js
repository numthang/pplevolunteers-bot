// /api/posts/[id]/assign — ผู้รับผิดชอบงานสื่อ (ทรงเดียวกับ /api/case/[ref]/assign)
//
// POST ไม่มี body   = "ฉันขอลงมือด้วย" (อาสาเองได้ ไม่ต้องรอใครมอบหมาย — กติกาเดียวกับ kanban)
// POST { userId }   = มอบหมายคนอื่น → ต้องเขียนโพสต์ใบนี้ได้
// DELETE            = ถอนตัวเอง · DELETE { userId } = ถอดคนอื่น (ต้องเขียนโพสต์ใบนี้ได้)
//
// ⛔ ห้ามเรียก addPostAssignee/removePostAssignee ตรงๆ ที่นี่ — ทุกทางต้องผ่าน lib/postAssign.js
//    เพื่อให้ sync การ์ด kanban + audit ครบทุกทางเข้า (บอร์ด kanban ก็เรียก service ตัวเดียวกัน)
import { postContext, err } from '@/lib/postsGuard.js'
import { canWritePost } from '@/lib/postsAccess.js'
import { assignPost, unassignPost, canAssignPost } from '@/lib/postAssign.js'

/** เป้าหมายของคำสั่ง — ไม่ส่ง userId มา = ตัวเอง */
async function target(req, ctx) {
  const body = await req.json().catch(() => ({}))
  return body?.userId ? Number(body.userId) : ctx.userId
}

export async function POST(req, { params }) {
  const ctx = await postContext((await params).id)
  if (ctx.error) return ctx.error

  // ⛔ ร่างส่วนตัวไม่มีผู้รับผิดชอบ (ดูเหตุผลใน lib/postAssign.js) — 400 ไม่ใช่ 403
  //    เพราะไม่ใช่เรื่องสิทธิ์ของคนกด แต่เป็นเรื่องที่โพสต์ใบนี้ยังไม่ใช่งานของทีม
  if (!canAssignPost(ctx.post)) return err(400, 'ร่างส่วนตัวยังไม่มีผู้รับผิดชอบ — เปิดให้ทีมเห็นก่อน')

  const userId = await target(req, ctx)
  if (userId !== ctx.userId && !canWritePost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return err(403, 'ไม่มีสิทธิ์เพิ่มผู้รับผิดชอบในงานสื่อชิ้นนี้')
  }

  const { assignees } = await assignPost(ctx.orgId, ctx.post, userId, { actorUserId: ctx.userId })
  return Response.json({ success: true, data: { assignees } })
}

export async function DELETE(req, { params }) {
  const ctx = await postContext((await params).id)
  if (ctx.error) return ctx.error
  if (!canAssignPost(ctx.post)) return err(400, 'ร่างส่วนตัวยังไม่มีผู้รับผิดชอบ — เปิดให้ทีมเห็นก่อน')

  const userId = await target(req, ctx)
  // ถอนตัวเองออกได้เสมอ · ถอดคนอื่นต้องเขียนโพสต์ใบนี้ได้
  if (userId !== ctx.userId && !canWritePost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return err(403, 'ไม่มีสิทธิ์ถอดผู้รับผิดชอบออกจากงานสื่อชิ้นนี้')
  }

  const { assignees } = await unassignPost(ctx.orgId, ctx.post, userId, { actorUserId: ctx.userId })
  return Response.json({ success: true, data: { assignees } })
}
