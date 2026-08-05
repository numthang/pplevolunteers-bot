/**
 * POST /api/posts/[id]/media/quote/preview — render การ์ดคำคมให้ดู **ไม่แตะ DB เลย**
 *
 * แยกจาก `../quote` (ตัวที่บันทึกจริง) เพราะกฎ CLAUDE.md:
 * หน้า Create ห้ามสร้างแถวใน DB จนกว่าผู้ใช้จะกดบันทึก — กดสลับสไตล์ดูเฉยๆ ต้องไม่เกิดสื่อค้าง
 *
 * รับ multipart/form-data · คืน **PNG ดิบ** (client เอาไปทำ objectURL ได้ตรงๆ)
 * รอบแรกส่งไฟล์มา → เซฟพื้นหลังลงดิสก์แล้วบอก path กลับทาง header `X-Bg-Path`
 * รอบต่อไปส่งแค่ `bgPath` มา → ไม่ต้องอัปไฟล์เดิมซ้ำทุกครั้งที่เปลี่ยนสไตล์
 */
import { postContext } from '@/lib/postsGuard.js'
import { canEditPost } from '@/lib/postsAccess.js'
import { resolveBackground, readQuoteForm, QuoteBgError } from '@/lib/quoteBg.js'
import { normalizeQuoteParams, renderQuoteCard, QuoteRenderError } from '@/lib/quoteRender.js'
import { resolveQuoteAccent } from '@/lib/quoteAccent.js'

export async function POST(req, { params }) {
  const { id } = await params
  const ctx = await postContext(id)
  if (ctx.error) return ctx.error

  if (!canEditPost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'แก้โพสต์นี้ไม่ได้' }, { status: 403 })
  }

  let form
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' }, { status: 400 })
  }

  try {
    const input = readQuoteForm(form)
    const paramsOut = normalizeQuoteParams(input)
    const { buffer: bg, bgPath } = await resolveBackground(input, ctx.post.id)
    const accent = await resolveQuoteAccent(ctx.userId, ctx.orgId)
    const png = await renderQuoteCard(bg, paramsOut, accent)

    return new Response(png, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(png.length),
        'X-Bg-Path': bgPath,           // client เก็บไว้ส่งกลับมารอบหน้า แทนการอัปไฟล์ซ้ำ
        'X-Quote-Style': paramsOut.style,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof QuoteBgError || error instanceof QuoteRenderError) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    console.error('[POST /api/posts/[id]/media/quote/preview]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
