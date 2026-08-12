import { postContext } from '@/lib/postsGuard.js'
import { canEditPost } from '@/lib/postsAccess.js'
import { consumeAiQuota } from '@/lib/postsAiQuota.js'
import { askAi, AiError } from '@/lib/ai.js'
import * as postDB from '@/db/posts/episodes.js'
import { getPrompt } from '@/db/orgAiPrompts.js'

/**
 * POST /api/posts/ai/draft — ร่างโพสต์เดียว (ไม่เขียนลง DB)
 * body { postId } → { success:true, data:{ body } }
 */
export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const ctx = await postContext(body.postId)
  if (ctx.error) return ctx.error

  if (!canEditPost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'ไม่มีสิทธิ์แก้โพสต์นี้' }, { status: 403 })
  }

  const quota = await consumeAiQuota(ctx.userId)
  if (!quota.ok) {
    return Response.json({ error: `ใช้ AI ครบโควตาวันนี้แล้ว (${quota.limit} ครั้ง/วัน)` }, { status: 429 })
  }

  // ชื่อโพสต์อื่นในหมวดเดียวกัน (กันเขียนซ้ำ) — ไม่มีหมวด = ไม่มีของให้เทียบ
  let otherTitles = []
  if (ctx.post.category) {
    const siblings = await postDB.listPosts(ctx.orgId, ctx.userId, { category: ctx.post.category })
    otherTitles = siblings.filter(p => p.id !== ctx.post.id && p.title).map(p => p.title)
  }

  const userLines = [
    `ชื่อโพสต์: ${ctx.post.title || '(ยังไม่ตั้งชื่อ)'}`,
    `โครง/เนื้อหาปัจจุบัน: ${ctx.post.body || '(ยังไม่มี)'}`,
  ]
  if (ctx.post.source_idea) userLines.push(`ไอเดียต้นทาง: ${ctx.post.source_idea}`)
  if (otherTitles.length) userLines.push(`โพสต์อื่นในหมวดเดียวกัน (ห้ามพูดซ้ำ): ${otherTitles.join(', ')}`)

  try {
    const draftBody = await askAi(await getPrompt('posts.draft', ctx.orgId), userLines.join('\n'), { orgId: ctx.orgId })
    return Response.json({ success: true, data: { body: draftBody } })
  } catch (error) {
    // โควตายืม key กลางหมด = 429 (ผู้ใช้แก้เองได้ด้วยการใส่ key องค์กร) · AI ล่มจริง = 502
    if (error instanceof AiError) return Response.json({ error: error.message }, { status: error.code === 'quota' ? 429 : 502 })
    console.error('[POST /api/posts/ai/draft]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
