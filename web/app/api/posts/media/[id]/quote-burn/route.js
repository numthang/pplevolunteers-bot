/**
 * /api/posts/media/[id]/quote-burn — เบิร์นคำคมลงคลิป ([id] = id ของสื่อ)
 *
 * GET  — สเปกคลิป (ขนาดที่ตาเห็น + ความยาว) ให้ modal วางกรอบพรีวิวและเตือนก่อนกดจริง
 * POST — render แล้ว**ทับแถวเดิม** (ไม่สร้างแถวใหม่)
 *
 * ⛔ ทำไมไม่มีตารางคิว: render จบใน request เดียว (คลิป 90 วิ ≈ 61 วิ จากที่วัดได้)
 *    แลกกับ nginx 1 บรรทัด (`proxy_read_timeout 300s`) แทนตาราง+worker+poll ทั้งกอง
 *    ข้อเสียที่ยอมรับแล้ว: ปิดแท็บกลางคัน = งานที่ค้างไม่มีใครเก็บ (ไฟล์ครึ่งๆ ให้ gc-media.js เก็บ)
 *
 * ℹ️ ไฟล์ต้นฉบับ **ไม่ลบทิ้งทันที** — ปล่อยให้กลายเป็นกำพร้าแล้ว `scripts/posts/gc-media.js`
 *    เก็บหลัง 7 วัน = ได้หน้าต่างกู้คืนฟรีโดยไม่ต้องเขียนโค้ด undo
 */
import { join } from 'path'
import { randomUUID } from 'crypto'
import { postContext } from '@/lib/postsGuard.js'
import { canEditPost } from '@/lib/postsAccess.js'
import { POSTS_DIR, absPath } from '@/lib/postsStorage.js'
import {
  burnQuoteOnVideo, probeVideoRel, normalizeBurnParams,
  VideoRenderError, MAX_BURN_SECONDS,
} from '@/lib/videoRender.js'
import { getMediaWithPost, replaceVideoFile } from '@/db/posts/media.js'

/** โหลดแถว + ตรวจสิทธิ์ + ตรวจว่าเป็นคลิปที่มีไฟล์จริง — GET กับ POST ใช้ร่วมกัน */
async function loadVideoRow(id) {
  const mediaId = Number(id)
  const row = Number.isInteger(mediaId) ? await getMediaWithPost(mediaId) : null
  if (!row) return { error: Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 }) }
  if (row.kind !== 'video') return { error: Response.json({ error: 'สื่อชิ้นนี้ไม่ใช่คลิป' }, { status: 400 }) }
  if (!row.path) {
    return { error: Response.json({ error: 'คลิปนี้ยังไม่มีไฟล์บนดิสก์' }, { status: 400 }) }
  }

  const ctx = await postContext(row.episode_id)
  if (ctx.error) return { error: ctx.error }
  if (row.org_id !== ctx.orgId || !canEditPost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return { error: Response.json({ error: 'แก้โพสต์นี้ไม่ได้' }, { status: 403 }) }
  }
  return { row, ctx, mediaId }
}

export async function GET(req, { params }) {
  const { id } = await params
  const { row, error } = await loadVideoRow(id)
  if (error) return error

  try {
    const info = await probeVideoRel(row.path)
    return Response.json({
      success: true,
      data: {
        width: info.width, height: info.height, duration: info.duration,
        rotation: info.rotation, hasAudio: !!info.audioCodec,
        maxSeconds: MAX_BURN_SECONDS,
        tooLong: info.duration > MAX_BURN_SECONDS,
      },
    })
  } catch (error) {
    if (error instanceof VideoRenderError) return Response.json({ error: error.message }, { status: 400 })
    console.error('[GET quote-burn]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(req, { params }) {
  const { id } = await params
  const { row, mediaId, error } = await loadVideoRow(id)
  if (error) return error

  let p
  try {
    p = normalizeBurnParams(await req.json().catch(() => ({})))
  } catch (err) {
    if (err instanceof VideoRenderError) return Response.json({ error: err.message }, { status: 400 })
    throw err
  }

  const outRel = join(POSTS_DIR, `${randomUUID()}.mp4`)
  absPath(outRel)   // กัน path traversal ตั้งแต่ก่อนแตะดิสก์ (ตามแบบเดียวกับ savePostFile)

  try {
    await burnQuoteOnVideo(row.path, outRel, p)
    const updated = await replaceVideoFile(mediaId, outRel, p.quoteText)
    if (!updated) return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 })
    return Response.json({ success: true, data: updated })
  } catch (error) {
    if (error instanceof VideoRenderError) return Response.json({ error: error.message }, { status: 400 })
    console.error('[POST quote-burn]', error)
    return Response.json({ error: 'สร้างคลิปไม่สำเร็จ' }, { status: 500 })
  }
}
