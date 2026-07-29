import { readFile } from 'fs/promises'
import { postContext } from '@/lib/postsGuard.js'
import { canReadPost, canEditPost } from '@/lib/postsAccess.js'
import { absPath, mimeOfPath, deletePostFile } from '@/lib/postsStorage.js'
import { getMediaWithPost, deleteMedia } from '@/db/posts/media.js'

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
  if (!row) return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 })

  // หา ctx (session/org/access/policy) จากโพสต์เจ้าของสื่อ
  const ctx = await postContext(row.episode_id)
  if (ctx.error) return ctx.error

  // เช็คด้วยแถวของสื่อเองก่อน stream — ไม่ผ่าน = 404 (ห้าม 403 กันยืนยันว่ามีอยู่)
  if (row.org_id !== ctx.orgId || !canReadPost(row, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 })
  }

  try {
    const buffer = await readFile(absPath(row.path))
    return new Response(buffer, {
      headers: {
        'Content-Type': mimeOfPath(row.path),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    if (error.code === 'ENOENT') return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 })
    console.error('[GET /api/posts/media/[id]]', error)
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
