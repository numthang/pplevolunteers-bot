// GET /api/posts/quote-accent?postId=<id> — สี CI ที่การ์ดคำคมจะใช้ถ้าไม่เลือกสีเอง
//
// มีไว้ให้ color picker ในโมดัลตั้งต้นที่ "สีจริง" ตั้งแต่เปิดมา — ไม่ใช่ดำหรือขาว
// ลำดับขึ้นกับ visibility ของโพสต์ (ดูเหตุผลที่ lib/quoteAccent.js): โพสต์ personal → personal
// ชนะก่อน · โพสต์ org (หรือไม่ส่ง postId มา) → guild ชนะก่อน
import { postsContext, postContext } from '@/lib/postsGuard.js'
import { resolveQuoteAccent } from '@/lib/quoteAccent.js'
import { DEFAULT_ACCENT } from '@/lib/quoteStyles.js'

export async function GET(req) {
  const postId = new URL(req.url).searchParams.get('postId')
  const ctx = postId ? await postContext(postId) : await postsContext()
  if (ctx.error) return ctx.error

  const mode = ctx.post?.visibility === 'personal' ? 'personal' : 'org'

  try {
    const accent = await resolveQuoteAccent(ctx.userId, ctx.orgId, mode)
    return Response.json({ accent: accent || DEFAULT_ACCENT })
  } catch (error) {
    console.error('[GET /api/posts/quote-accent]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
