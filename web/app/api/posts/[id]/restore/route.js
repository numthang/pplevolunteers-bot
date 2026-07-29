// POST /api/posts/[id]/restore — เอาโพสต์ออกจากกรุ (คู่กับ DELETE ที่ default = เก็บเข้ากรุ)
// ใช้ canWritePost เหมือนตอน archive — โพสต์ที่ approved แล้วก็กู้คืนได้ (ล็อกไว้กันแก้เนื้อหา ไม่ใช่กันย้ายกรุ)
import { postContext } from '@/lib/postsGuard.js'
import { canWritePost } from '@/lib/postsAccess.js'
import * as postDB from '@/db/posts/episodes.js'

export async function POST(req, { params }) {
  const { id } = await params
  const ctx = await postContext(id)
  if (ctx.error) return ctx.error

  if (!canWritePost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'ไม่มีสิทธิ์กู้คืนโพสต์นี้' }, { status: 403 })
  }

  try {
    await postDB.archivePost(ctx.post.id, false)
    return Response.json({ success: true })
  } catch (error) {
    console.error('[POST /api/posts/[id]/restore]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
