/**
 * POST /api/posts/[id]/media/video — อัปคลิป **แบบสตรีม** (body = ไฟล์ดิบ ไม่ใช่ multipart)
 *
 * ⛔ ทำไมไม่ใช้ `/api/posts/[id]/media` ที่มีอยู่แล้ว: ตัวนั้นใช้ `req.formData()` ซึ่งอมทั้งไฟล์
 *    ไว้ใน RAM แล้ว `Buffer.from(arrayBuffer)` อีกชุด — คลิป 200 MB = 400 MB ต่อ request
 *    ที่นี่ต่อ `req.body` เข้า `createWriteStream` ตรงๆ หน่วยความจำคงที่ไม่ว่าไฟล์ใหญ่แค่ไหน
 *    (multipart สตรีมได้เหมือนกันแต่ต้องลง parser เพิ่ม — ไฟล์เดียวส่งดิบไม่ต้องมี parser เลย)
 *
 * ชื่อไฟล์ไม่สน (เก็บเป็น uuid อยู่แล้ว) · ชนิดไฟล์อ่านจาก header `Content-Type`
 */
import { postContext } from '@/lib/postsGuard.js'
import { canEditPost } from '@/lib/postsAccess.js'
import {
  savePostFileFromStream, isAllowedVideoMime,
  MAX_VIDEO_SIZE, MAX_MEDIA_PER_EPISODE, MAX_VIDEO_PER_EPISODE,
} from '@/lib/postsStorage.js'
import { countMedia, countVideos, addMedia } from '@/db/posts/media.js'

const mb = bytes => Math.round(bytes / (1024 * 1024))

export async function POST(req, { params }) {
  const { id } = await params
  const ctx = await postContext(id)
  if (ctx.error) return ctx.error

  if (!canEditPost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'แก้โพสต์นี้ไม่ได้' }, { status: 403 })
  }

  const mime = (req.headers.get('content-type') || '').split(';')[0].trim()
  if (!isAllowedVideoMime(mime)) {
    return Response.json({ error: `ชนิดไฟล์ไม่รองรับ: ${mime || 'ไม่ระบุ'}` }, { status: 400 })
  }

  // เช็คจาก Content-Length ก่อน = ตัดตั้งแต่ยังไม่เขียนดิสก์ · แต่เชื่อไม่ได้ 100%
  // (client ปลอมได้) จึงยังต้องนับไบต์จริงระหว่างสตรีมอีกชั้นใน savePostFileFromStream
  const declared = Number(req.headers.get('content-length') || 0)
  if (declared > MAX_VIDEO_SIZE) {
    return Response.json({ error: `คลิปใหญ่เกินไป (จำกัด ${mb(MAX_VIDEO_SIZE)}MB)` }, { status: 413 })
  }
  if (!req.body) return Response.json({ error: 'ไม่พบไฟล์ที่จะอัปโหลด' }, { status: 400 })

  try {
    const [existing, haveVideos] = await Promise.all([countMedia(ctx.post.id), countVideos(ctx.post.id)])
    if (existing >= MAX_MEDIA_PER_EPISODE) {
      return Response.json({ error: `แนบสื่อได้ไม่เกิน ${MAX_MEDIA_PER_EPISODE} ชิ้นต่อโพสต์` }, { status: 400 })
    }
    if (haveVideos >= MAX_VIDEO_PER_EPISODE) {
      return Response.json(
        { error: `แนบคลิปได้โพสต์ละ ${MAX_VIDEO_PER_EPISODE} ชิ้นเท่านั้น — ลบคลิปเดิมก่อน` },
        { status: 400 }
      )
    }

    const { relPath } = await savePostFileFromStream(req.body, mime, MAX_VIDEO_SIZE)
    const media = await addMedia({ episodeId: ctx.post.id, kind: 'video', path: relPath, addedBy: ctx.userId })
    return Response.json({ success: true, data: media }, { status: 201 })
  } catch (error) {
    if (error.code === 'TOO_LARGE') {
      return Response.json({ error: `คลิปใหญ่เกินไป (จำกัด ${mb(MAX_VIDEO_SIZE)}MB)` }, { status: 413 })
    }
    if (error.code === 'EMPTY') return Response.json({ error: 'ไฟล์ว่าง' }, { status: 400 })
    console.error('[POST /api/posts/[id]/media/video]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
