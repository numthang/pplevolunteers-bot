// GET /api/posts/quote-accent — สี CI ที่การ์ดคำคมจะใช้ถ้าไม่เลือกสีเอง
//
// มีไว้ให้ color picker ในโมดัลตั้งต้นที่ "สีจริงขององค์กร" ตั้งแต่เปิดมา — ไม่ใช่ดำหรือขาว
// (จะเดาฝั่ง client ไม่ได้ ลำดับ personal > guild > global อยู่ใน DB ทั้งหมด)
import { postsContext } from '@/lib/postsGuard.js'
import { resolveQuoteAccent } from '@/lib/quoteAccent.js'
import { DEFAULT_ACCENT } from '@/lib/quoteStyles.js'

export async function GET() {
  const ctx = await postsContext()
  if (ctx.error) return ctx.error

  try {
    const accent = await resolveQuoteAccent(ctx.userId, ctx.orgId)
    return Response.json({ accent: accent || DEFAULT_ACCENT })
  } catch (error) {
    console.error('[GET /api/posts/quote-accent]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
