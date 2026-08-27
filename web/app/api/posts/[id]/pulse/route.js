/**
 * GET /api/posts/[id]/pulse — ชีพจรของโพสต์ สำหรับ editor ที่เปิดค้างอยู่ (ทุก 20 วิ)
 *
 * มีไว้ทำ 2 อย่างเท่านั้น:
 *   1. บอกว่า lock_token ขยับหรือยัง → editor จะได้ดึงฉบับใหม่ "ตอนที่ยังไม่มีของค้าง" แทนที่จะไปชน 409 ทีหลัง
 *   2. ชื่อคนที่แก้ล่าสุด → ป้าย "ใครกำลังแก้อยู่" (autosave 800ms ทำให้ค่านี้ใกล้เคียง presence จริง)
 *
 * ⛔ ห้ามให้ฝั่ง client เอา lockToken จากที่นี่ไปใส่ lockTokenRef เด็ดขาด — ใช้ "เทียบ" อย่างเดียว
 *    ถ้าเอาไปใส่ = autosave ผ่านด่าน lock ทุกครั้งโดยไม่ได้เห็นเนื้อหาใหม่ = last-write-wins กลับมาทับงานคนอื่น (bug-071)
 * ⛔ ห้ามใช้ GET /api/posts/[id] มา poll แทน — ตัวนั้นทำ listMedia + getPostUsage + คำนวณสิทธิ์ 6 ตัวต่อครั้ง
 */
import { postContext } from '@/lib/postsGuard.js'
import * as postDB from '@/db/posts/episodes.js'

export async function GET(req, { params }) {
  const { id } = await params
  const ctx = await postContext(id)
  if (ctx.error) return ctx.error

  try {
    const pulse = await postDB.getPostPulse(ctx.post.id)
    if (!pulse) return Response.json({ error: 'ไม่พบโพสต์' }, { status: 404 })

    const byMe = Number(pulse.last_edited_by) === Number(ctx.userId)
    return Response.json({
      success: true,
      data: {
        lockToken: pulse.lock_token,
        updatedAt: pulse.updated_at,
        byMe,                                            // แก้จากแท็บอื่นของตัวเองก็ชนได้เหมือนกัน
        editorName: pulse.last_edited_by ? pulse.last_editor_name : null,
      },
    })
  } catch (error) {
    console.error('[GET /api/posts/[id]/pulse]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
