import { postContext, editorName } from '@/lib/postsGuard.js'
import { canWritePost, canApprove, canRequestChanges } from '@/lib/postsAccess.js'
import * as postDB from '@/db/posts/episodes.js'

const VALID_STATUS = ['draft', 'review', 'approved']

/**
 * POST /api/posts/[id]/status — { status:'draft'|'review'|'approved' }
 */
export async function POST(req, { params }) {
  const { id } = await params
  const ctx = await postContext(id)
  if (ctx.error) return ctx.error

  const { status } = await req.json().catch(() => ({}))
  if (!VALID_STATUS.includes(status)) {
    return Response.json({ error: 'สถานะไม่ถูกต้อง' }, { status: 400 })
  }

  const goingToApproved = status === 'approved'
  const leavingApproved = ctx.post.status === 'approved' && status !== 'approved'

  let allowed
  if (goingToApproved) allowed = canApprove(ctx.access)
  else if (leavingApproved) allowed = canRequestChanges(ctx.post, ctx.access, ctx.userId, ctx.policy)
  else allowed = canWritePost(ctx.post, ctx.access, ctx.userId, ctx.policy)

  if (!allowed) return Response.json({ error: 'ไม่มีสิทธิ์เปลี่ยนสถานะนี้' }, { status: 403 })

  try {
    const post = await postDB.setPostStatus(ctx.post.id, status, {
      approvedBy: goingToApproved ? ctx.userId : null,
      approvedByName: goingToApproved ? editorName(ctx.session) : null,
    })
    return Response.json({ success: true, data: { post } })
  } catch (error) {
    console.error('[POST /api/posts/[id]/status]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
