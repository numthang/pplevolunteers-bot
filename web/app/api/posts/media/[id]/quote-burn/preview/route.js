/**
 * POST /api/posts/media/[id]/quote-burn/preview — คืน **PNG ชั้นข้อความโปร่งใส** ของคลิปนี้
 *
 * ไม่แตะ ffmpeg และ **ไม่แตะ DB** — modal เอาไปวางทับ `<video>` ด้วย CSS ได้พรีวิวที่ตรงกับ
 * ของจริงเป๊ะ (ตัวเดียวกับที่จะถูกเบิร์น) โดยจ่าย ffmpeg ครั้งเดียวตอนกดยืนยัน
 */
import { postContext } from '@/lib/postsGuard.js'
import { canEditPost } from '@/lib/postsAccess.js'
import { renderOverlayPng, probeVideoRel, normalizeBurnParams, VideoRenderError } from '@/lib/videoRender.js'
import { getMediaWithPost } from '@/db/posts/media.js'

export async function POST(req, { params }) {
  const { id } = await params
  const mediaId = Number(id)
  const row = Number.isInteger(mediaId) ? await getMediaWithPost(mediaId) : null
  if (!row?.path || row.kind !== 'video') return Response.json({ error: 'ไม่พบคลิป' }, { status: 404 })

  const ctx = await postContext(row.episode_id)
  if (ctx.error) return ctx.error
  if (row.org_id !== ctx.orgId || !canEditPost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'แก้โพสต์นี้ไม่ได้' }, { status: 403 })
  }

  try {
    const p = normalizeBurnParams(await req.json().catch(() => ({})))
    const info = await probeVideoRel(row.path)
    const png = await renderOverlayPng(info.width, info.height, p)
    return new Response(png, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    if (error instanceof VideoRenderError) return Response.json({ error: error.message }, { status: 400 })
    console.error('[POST quote-burn/preview]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
