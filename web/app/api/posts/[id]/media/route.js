import { postContext } from '@/lib/postsGuard.js'
import { canEditPost } from '@/lib/postsAccess.js'
import { savePostFile, isAllowedMime, MAX_FILE_SIZE, MAX_MEDIA_PER_EPISODE } from '@/lib/postsStorage.js'
import { listMedia, countMedia, addMedia, reorderMedia } from '@/db/posts/media.js'

/**
 * GET /api/posts/[id]/media — [id] = id ของโพสต์
 */
export async function GET(req, { params }) {
  const { id } = await params
  const ctx = await postContext(id)
  if (ctx.error) return ctx.error

  try {
    const media = await listMedia(ctx.post.id)
    return Response.json({ success: true, data: media })
  } catch (error) {
    console.error('[GET /api/posts/[id]/media]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * POST /api/posts/[id]/media — อัปโหลด (multipart/form-data, field `files`, หลายไฟล์ได้)
 */
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
    return Response.json({ error: 'อัปโหลดไม่สำเร็จ' }, { status: 400 })
  }

  // validate ฝั่ง server เสมอ — อย่าเชื่อ client
  const files = form.getAll('files').filter(f => typeof f === 'object' && f.size > 0)
  if (!files.length) return Response.json({ error: 'ไม่พบไฟล์ที่จะอัปโหลด' }, { status: 400 })

  for (const f of files) {
    if (!isAllowedMime(f.type)) {
      return Response.json({ error: `ชนิดไฟล์ไม่รองรับ: ${f.type}` }, { status: 400 })
    }
    if (f.size > MAX_FILE_SIZE) {
      return Response.json({ error: 'ไฟล์ใหญ่เกินไป (จำกัด 12MB ต่อไฟล์)' }, { status: 400 })
    }
  }

  try {
    const existing = await countMedia(ctx.post.id)
    if (existing + files.length > MAX_MEDIA_PER_EPISODE) {
      return Response.json(
        { error: `แนบสื่อได้ไม่เกิน ${MAX_MEDIA_PER_EPISODE} ชิ้นต่อโพสต์ (มีอยู่แล้ว ${existing} ชิ้น)` },
        { status: 400 }
      )
    }

    const uploaded = []
    for (const f of files) {
      const buffer = Buffer.from(await f.arrayBuffer())
      const path = await savePostFile(buffer, f.type)
      const media = await addMedia({ episodeId: ctx.post.id, kind: 'upload', path, addedBy: ctx.userId })
      uploaded.push(media)
    }

    return Response.json({ success: true, data: uploaded }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/posts/[id]/media]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * PATCH /api/posts/[id]/media — ลากเรียงใหม่ { orderedIds:number[] }
 */
export async function PATCH(req, { params }) {
  const { id } = await params
  const ctx = await postContext(id)
  if (ctx.error) return ctx.error

  if (!canEditPost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'แก้โพสต์นี้ไม่ได้' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const orderedIds = body.orderedIds
  if (!Array.isArray(orderedIds) || !orderedIds.length || !orderedIds.every(n => Number.isInteger(n))) {
    return Response.json({ error: 'ลำดับสื่อไม่ถูกต้อง' }, { status: 400 })
  }

  try {
    await reorderMedia(ctx.post.id, orderedIds)
    const media = await listMedia(ctx.post.id)
    return Response.json({ success: true, data: media })
  } catch (error) {
    console.error('[PATCH /api/posts/[id]/media]', error)
    return Response.json({ error: 'จัดลำดับสื่อไม่สำเร็จ (มี id ที่ไม่ใช่ของโพสต์นี้)' }, { status: 400 })
  }
}
