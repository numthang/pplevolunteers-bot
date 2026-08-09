import { postContext } from '@/lib/postsGuard.js'
import { canEditPost } from '@/lib/postsAccess.js'
import { consumeAiQuota } from '@/lib/postsAiQuota.js'
import { askAi, AiError } from '@/lib/ai.js'
import * as postDB from '@/db/posts/episodes.js'

const SYSTEM_PROMPT = `คุณเป็นผู้ช่วยบรรณาธิการงานสื่อของพรรคการเมืองไทย
งานของคุณคือเขียนเนื้อหาโพสต์โซเชียล 1 โพสต์ให้เต็มจากโครง/ไอเดียที่ให้มา
กติกา:
- ถ้าโครงที่ให้มาสั้น (แค่หัวข้อ) → ขยายเป็นเนื้อหาโพสต์ที่โพสต์ได้จริง
- ถ้ามีเนื้อหาอยู่แล้ว → ปรับ/ขัดเกลาให้สมบูรณ์ ห้ามแต่งประเด็นใหม่ที่ไม่มีในต้นฉบับ
- ห้ามพูดซ้ำประเด็นที่ถูกใช้ไปแล้วในโพสต์อื่นของหมวดเดียวกัน (ถ้ามีให้ดู)
- ตอบเป็นเนื้อหาโพสต์ล้วนๆ ห้ามมีหัวข้อ/คำอธิบาย/markdown ครอบ`

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
    const draftBody = await askAi(SYSTEM_PROMPT, userLines.join('\n'), { orgId: ctx.orgId })
    return Response.json({ success: true, data: { body: draftBody } })
  } catch (error) {
    if (error instanceof AiError) return Response.json({ error: error.message }, { status: 502 })
    console.error('[POST /api/posts/ai/draft]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
