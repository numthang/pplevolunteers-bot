import { postContext } from '@/lib/postsGuard.js'
import * as postDB from '@/db/posts/episodes.js'

/**
 * GET /api/posts/[id]/revisions
 */
export async function GET(req, { params }) {
  const { id } = await params
  const ctx = await postContext(id)
  if (ctx.error) return ctx.error

  try {
    const data = await postDB.listRevisions(ctx.post.id)
    return Response.json({ success: true, data })
  } catch (error) {
    console.error('[GET /api/posts/[id]/revisions]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
