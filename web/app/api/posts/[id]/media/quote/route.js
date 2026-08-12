/**
 * POST /api/posts/[id]/media/quote — บันทึกการ์ดคำคมเข้ากล่องสื่อของโพสต์ (ปุ่ม "บันทึก")
 *
 * คู่กับ `./preview/route.js` ที่ render ให้ดูเฉยๆ ไม่แตะ DB — ที่นี่คือจุดเดียวที่เกิดแถวจริง
 *
 * เก็บ **params ไม่ใช่แค่ PNG** (`quote_text`/`quote_style`/`bg_path`) ตามที่ตารางออกแบบไว้
 * → แก้ข้อความทีหลังแล้ว render ใหม่ได้ ไม่ต้องเริ่มจากศูนย์
 */
import { postContext } from '@/lib/postsGuard.js'
import { canEditPost } from '@/lib/postsAccess.js'
import { savePostFile, MAX_MEDIA_PER_EPISODE } from '@/lib/postsStorage.js'
import { addMedia, countMedia } from '@/db/posts/media.js'
import { resolveBackground, readQuoteForm, pickedAccent, QuoteBgError } from '@/lib/quoteBg.js'
import {
  normalizeQuoteParams, renderQuoteCard, renderPlainCard, isPlainStyle, QuoteRenderError,
} from '@/lib/quoteRender.js'
import { resolveQuoteAccent } from '@/lib/quoteAccent.js'
import { resolvePlainWatermark } from '@/lib/quoteWatermark.js'

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
    const quoteParams = normalizeQuoteParams(input)

    // เช็คเพดานก่อน render — render แล้วค่อยรู้ว่าเต็ม = เผา CPU ฟรี
    const existing = await countMedia(ctx.post.id)
    if (existing >= MAX_MEDIA_PER_EPISODE) {
      return Response.json(
        { error: `แนบสื่อได้ไม่เกิน ${MAX_MEDIA_PER_EPISODE} ชิ้นต่อโพสต์` },
        { status: 400 }
      )
    }

    // สีที่เลือกเองชนะสี CI (เหมือน /preview เป๊ะ — ไม่งั้นพรีวิวกับของที่บันทึกคนละสี)
    const accent = pickedAccent(input.accent) || await resolveQuoteAccent(ctx.userId, ctx.orgId)
    // สีตัวอักษรคำคม — เหมือน /preview เป๊ะ ไม่งั้นพรีวิวกับที่บันทึกคนละสี
    const textColor = pickedAccent(input.textColor)

    // การ์ดไม่มีรูป — ไม่มีไฟล์พื้นหลัง จึงเก็บ `bg_path` เป็น NULL
    // (ไม่เก็บ ref ของลายน้ำลง bg_path ด้วย: คอลัมน์นั้นถูก deletePostFile ตอนลบการ์ด
    //  = จะลากไฟล์ลายน้ำขององค์กรหายไปด้วย · การ์ด plain re-render ใหม่ได้จาก quote_text+style อยู่แล้ว)
    let png, bgPath = null
    if (isPlainStyle(quoteParams.style)) {
      const wm = await resolvePlainWatermark(input.wmType, ctx)
      png = await renderPlainCard(quoteParams, accent, wm, textColor)
    } else {
      const bg = await resolveBackground(input, ctx.post.id)
      bgPath = bg.bgPath
      png = await renderQuoteCard(bg.buffer, quoteParams, accent, textColor)
    }
    const path = await savePostFile(png, 'image/png')

    const media = await addMedia({
      episodeId: ctx.post.id,
      kind: 'quote',
      path,
      quoteText: quoteParams.quoteText,
      quoteStyle: quoteParams.style,
      bgPath,
      addedBy: ctx.userId,
    })

    return Response.json({ success: true, data: media }, { status: 201 })
  } catch (error) {
    if (error instanceof QuoteBgError || error instanceof QuoteRenderError) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    console.error('[POST /api/posts/[id]/media/quote]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
