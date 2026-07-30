import { postContext } from '@/lib/postsGuard.js'
import { canEditPost } from '@/lib/postsAccess.js'
import { listSuggestions, deleteSuggestion } from '@/db/posts/aiSuggestions.js'

/**
 * GET /api/posts/[id]/ai-suggestions — ข้อเสนอ AI ที่เคยขอไว้กับโพสต์นี้ (ใหม่สุดขึ้นก่อน)
 * สิทธิ์อ่าน = สิทธิ์อ่านโพสต์ (postContext จัดการให้แล้ว) ไม่ต้องเช็คเพิ่ม
 */
export async function GET(req, { params }) {
  const { id } = await params
  const ctx = await postContext(id)
  if (ctx.error) return ctx.error

  try {
    const data = await listSuggestions(ctx.post.id)
    return Response.json({ success: true, data })
  } catch (error) {
    console.error('[GET /api/posts/[id]/ai-suggestions]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * DELETE /api/posts/[id]/ai-suggestions?sid=<id> — ลบทีละชุด
 * ลบได้ = แก้โพสต์ได้ (คนที่อ่านได้อย่างเดียวไม่ควรลบของคนอื่นทิ้ง)
 */
export async function DELETE(req, { params }) {
  const { id } = await params
  const ctx = await postContext(id)
  if (ctx.error) return ctx.error

  if (!canEditPost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'แก้โพสต์นี้ไม่ได้' }, { status: 403 })
  }

  const sid = Number(new URL(req.url).searchParams.get('sid'))
  if (!Number.isInteger(sid)) return Response.json({ error: 'sid ไม่ถูกต้อง' }, { status: 400 })

  try {
    // deleteSuggestion ผูก episode_id ใน WHERE ด้วย → ลบข้ามโพสต์ด้วย id เดาไม่ได้
    const ok = await deleteSuggestion(sid, ctx.post.id)
    if (!ok) return Response.json({ error: 'ไม่พบข้อเสนอนี้' }, { status: 404 })
    return Response.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/posts/[id]/ai-suggestions]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
