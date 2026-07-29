import { postContext } from '@/lib/postsGuard.js'
import { canPromoteToOrg } from '@/lib/postsAccess.js'
import * as postDB from '@/db/posts/episodes.js'

/**
 * POST /api/posts/[id]/promote — เปิดร่างส่วนตัวให้ทีมเห็น (ทางเดียว)
 */
export async function POST(req, { params }) {
  const { id } = await params
  const ctx = await postContext(id)
  if (ctx.error) return ctx.error

  try {
    const usage = await postDB.getPostUsage(ctx.post.id)
    if (!canPromoteToOrg(ctx.post, ctx.access, ctx.userId, usage)) {
      const reasons = []
      if (usage.hasComments) reasons.push('มีคอมเมนต์แล้ว')
      if (usage.hasApprovals) reasons.push('อนุมัติไปแล้ว')
      if (usage.hasJobs) reasons.push('มีงานโพสต์ในคิวแล้ว')
      const reasonText = reasons.length ? reasons.join(', ') : 'ไม่ใช่ร่างส่วนตัวที่เปิดได้'
      return Response.json({ error: `เปิดให้ทีมเห็นไม่ได้ (${reasonText})` }, { status: 409 })
    }

    const post = await postDB.promoteToOrg(ctx.post.id, ctx.userId)
    return Response.json({ success: true, data: { post } })
  } catch (error) {
    console.error('[POST /api/posts/[id]/promote]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
