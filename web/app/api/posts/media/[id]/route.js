import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import { postContext } from '@/lib/postsGuard.js'
import { canReadPost, canEditPost } from '@/lib/postsAccess.js'
import { absPath, mimeOfPath, deletePostFile, savePostFile, isAllowedMime, MAX_FILE_SIZE } from '@/lib/postsStorage.js'
import { getOrCreateThumb } from '@/lib/postsThumbs.js'
import { getMediaWithPost, deleteMedia, replaceMediaFile, pathStillUsed } from '@/db/posts/media.js'

/**
 * [id] ในไฟล์นี้ = id ของสื่อ (ต่างจาก /api/posts/[id]/media ที่ [id] = id ของโพสต์)
 */

/**
 * GET /api/posts/media/[id] — เสิร์ฟไฟล์ (นอก public/ ต้องผ่าน gate เสมอ)
 */
export async function GET(req, { params }) {
  const { id } = await params
  const mediaId = Number(id)
  const row = Number.isInteger(mediaId) ? await getMediaWithPost(mediaId) : null
  // `path` เป็น nullable ตั้งแต่ก้อน 4c — NULL = สื่อจากตะกร้าดิสฯ ที่ยังโหลดไฟล์ไม่เสร็จ
  // (ไม่กันตรงนี้ absPath(null) จะโยน TypeError แล้วตอบ 500)
  if (!row?.path) return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 })

  // หา ctx (session/org/access/policy) จากโพสต์เจ้าของสื่อ
  const ctx = await postContext(row.episode_id)
  if (ctx.error) return ctx.error

  // เช็คด้วยแถวของสื่อเองก่อน stream — ไม่ผ่าน = 404 (ห้าม 403 กันยืนยันว่ามีอยู่)
  if (row.org_id !== ctx.orgId || !canReadPost(row, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 })
  }

  // ?thumb=1 — กริดในหน้า /posts/[id] ขอรูปย่อแทน original ประหยัดแบนด์วิดท์/เวลาโหลด
  // max-age ยาวได้เพราะ path ต้นฉบับเป็น uuid ใหม่ทุกครั้งที่ไฟล์เปลี่ยน + ฝั่ง client มี ?v= อยู่แล้ว
  if (new URL(req.url).searchParams.get('thumb') === '1' && row.kind !== 'video') {
    const thumb = await getOrCreateThumb(row.path)
    if (thumb) {
      return new Response(thumb, {
        headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=31536000, immutable' },
      })
    }
    // สร้างไม่สำเร็จ → ตกลงไปเสิร์ฟต้นฉบับตามเดิม (รูปต้องไม่แตก)
  }

  try {
    const abs = absPath(row.path)
    const { size } = await stat(abs)
    const headers = {
      'Content-Type': mimeOfPath(row.path),
      'Cache-Control': 'private, max-age=3600',
      // 🎬 ไม่มีบรรทัดนี้ + 206 = `<video>` เล่นคลิปไม่ได้จริง:
      //    Safari/iOS **ปฏิเสธเล่นทันที** ถ้าเซิร์ฟเวอร์ไม่ตอบ range · Chrome เล่นได้แต่เลื่อน timeline ไม่ได้
      //    และการ readFile ทั้งก้อนแบบเดิมคือดูดคลิป 60MB เข้า RAM ทุกครั้งที่มีคนกดเล่น
      'Accept-Ranges': 'bytes',
    }

    const range = req.headers.get('range')
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (m) {
      // `bytes=-500` = ท้ายไฟล์ 500 ไบต์ (ไม่ใช่ start=0) — เบราว์เซอร์ใช้จริงตอนหา moov atom ของ mp4
      const suffix = m[1] === ''
      const start = suffix ? Math.max(0, size - Number(m[2])) : Number(m[1])
      const end = suffix || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)

      if (!Number.isFinite(start) || start >= size || end < start) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
      }
      return new Response(Readable.toWeb(createReadStream(abs, { start, end })), {
        status: 206,
        headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
      })
    }

    return new Response(Readable.toWeb(createReadStream(abs)), {
      headers: { ...headers, 'Content-Length': String(size) },
    })
  } catch (error) {
    if (error.code === 'ENOENT') return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 })
    console.error('[GET /api/posts/media/[id]]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * PUT /api/posts/media/[id] — ทับไฟล์เดิมด้วยรูปที่แก้แล้วจาก ImageEditorModal (ครอบตัด/เบลอหน้า)
 * multipart/form-data field `file` · แถวเดิม id เดิม sort_order เดิม (ตำแหน่งในโพสต์ไม่ขยับ)
 *
 * ลบไฟล์เก่า **ทันที** ไม่รอ gc-media.js — ต้นฉบับที่ยังไม่เบลอหน้าค้างบนดิสก์อีก 7 วันไม่ได้
 * (เว้นแต่มีแถวอื่นอ้างไฟล์นั้นอยู่ เช่นถูกใช้เป็นพื้นหลังการ์ดคำคม)
 */
export async function PUT(req, { params }) {
  const { id } = await params
  const mediaId = Number(id)
  const row = Number.isInteger(mediaId) ? await getMediaWithPost(mediaId) : null
  if (!row) return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 })
  if (row.kind === 'video') return Response.json({ error: 'แก้ไขวิดีโอไม่ได้' }, { status: 400 })

  const ctx = await postContext(row.episode_id)
  if (ctx.error) return ctx.error

  if (row.org_id !== ctx.orgId || !canEditPost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'แก้โพสต์นี้ไม่ได้' }, { status: 403 })
  }

  let file
  try {
    file = (await req.formData()).get('file')
  } catch {
    return Response.json({ error: 'บันทึกรูปไม่สำเร็จ' }, { status: 400 })
  }
  if (!file || typeof file !== 'object' || !file.size) {
    return Response.json({ error: 'ไม่พบไฟล์รูป' }, { status: 400 })
  }
  if (!isAllowedMime(file.type)) return Response.json({ error: `ชนิดไฟล์ไม่รองรับ: ${file.type}` }, { status: 400 })
  if (file.size > MAX_FILE_SIZE) return Response.json({ error: 'ไฟล์ใหญ่เกินไป (จำกัด 12MB ต่อไฟล์)' }, { status: 400 })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const path = await savePostFile(buffer, file.type)
    const updated = await replaceMediaFile(mediaId, path)
    if (!updated) return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 })

    if (row.path && row.path !== path && !(await pathStillUsed(row.path, mediaId))) {
      await deletePostFile(row.path).catch(e => console.error('[PUT media: ลบไฟล์เก่า]', e.message))
    }
    return Response.json({ success: true, data: updated })
  } catch (error) {
    console.error('[PUT /api/posts/media/[id]]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * DELETE /api/posts/media/[id]
 */
export async function DELETE(req, { params }) {
  const { id } = await params
  const mediaId = Number(id)
  const row = Number.isInteger(mediaId) ? await getMediaWithPost(mediaId) : null
  if (!row) return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 })

  const ctx = await postContext(row.episode_id)
  if (ctx.error) return ctx.error

  if (!canEditPost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'แก้โพสต์นี้ไม่ได้' }, { status: 403 })
  }

  try {
    const deleted = await deleteMedia(mediaId)
    if (deleted) {
      // ลบไฟล์ล้มไม่ทำให้ request พัง — แค่ log ไว้
      await deletePostFile(deleted.path).catch(e => console.error('[DELETE media file]', e.message))
      if (deleted.bg_path) {
        await deletePostFile(deleted.bg_path).catch(e => console.error('[DELETE media bg_path]', e.message))
      }
    }
    return Response.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/posts/media/[id]]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
