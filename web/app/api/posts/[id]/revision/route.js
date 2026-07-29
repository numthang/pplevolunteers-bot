import { postContext, editorName } from '@/lib/postsGuard.js'
import { canWritePost } from '@/lib/postsAccess.js'
import * as postDB from '@/db/posts/episodes.js'

/**
 * POST /api/posts/[id]/revision — "เก็บฉบับของฉัน" ตอนชน 409 { title?, body? }
 */
export async function POST(req, { params }) {
  const { id } = await params
  const ctx = await postContext(id)
  if (ctx.error) return ctx.error

  if (!canWritePost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'ไม่มีสิทธิ์แก้โพสต์นี้' }, { status: 403 })
  }

  const { title, body } = await req.json().catch(() => ({}))

  try {
    const revision = await postDB.saveRevisionOnly(ctx.post.id, {
      title, body, editedByUserId: ctx.userId, editedByName: editorName(ctx.session),
    })
    return Response.json({ success: true, data: revision })
  } catch (error) {
    console.error('[POST /api/posts/[id]/revision]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
