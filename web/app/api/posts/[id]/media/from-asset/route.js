/**
 * POST /api/posts/[id]/media/from-asset — หยิบรูปจากคลังภาพมาแนบโพสต์ · body { assetId }
 *
 * ⛔ **คัดลอกไฟล์เป็น uuid ใหม่เสมอ ห้ามใช้ path ของ asset ตรงๆ** (เคาะ 2026-08-04)
 *    เพราะ DELETE ของสื่อโพสต์ + `services/postsRetention.js` ลบไฟล์จริงจาก path ของแถวโพสต์
 *    → แชร์ path เมื่อไหร่ = ไฟล์ในคลังหายเงียบๆ · สายสัมพันธ์เก็บที่ `source_asset_id`
 */
import { postContext, assetContext } from '@/lib/postsGuard.js'
import { canEditPost } from '@/lib/postsAccess.js'
import { copyPostFile, MAX_MEDIA_PER_EPISODE } from '@/lib/postsStorage.js'
import { addMedia, countMedia } from '@/db/posts/media.js'

export async function POST(req, { params }) {
  const { id } = await params
  const ctx = await postContext(id)
  if (ctx.error) return ctx.error

  if (!canEditPost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'แก้โพสต์นี้ไม่ได้' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  // assetContext เช็คให้แล้วว่ารูปอยู่ org เดียวกัน + คนนี้เห็นได้ (กองกลาง หรือ กองตัวเอง)
  const actx = await assetContext(body.assetId)
  if (actx.error) return actx.error

  try {
    const existing = await countMedia(ctx.post.id)
    if (existing >= MAX_MEDIA_PER_EPISODE) {
      return Response.json(
        { error: `แนบสื่อได้ไม่เกิน ${MAX_MEDIA_PER_EPISODE} ชิ้นต่อโพสต์` },
        { status: 400 }
      )
    }

    const path = await copyPostFile(actx.asset.path)
    const media = await addMedia({
      episodeId: ctx.post.id,
      kind: 'upload',
      path,
      addedBy: ctx.userId,
      sourceAssetId: actx.asset.id,
    })
    return Response.json({ success: true, data: media }, { status: 201 })
  } catch (error) {
    if (error.code === 'ENOENT') return Response.json({ error: 'ไฟล์ต้นฉบับในคลังหายไป' }, { status: 404 })
    console.error('[POST /api/posts/[id]/media/from-asset]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
