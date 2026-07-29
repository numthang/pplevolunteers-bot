import { postContext } from '@/lib/postsGuard.js'
import { listJobs } from '@/db/posts/jobs.js'

/**
 * GET /api/posts/[id]/jobs — งานโพสต์ของโพสต์นี้ (คิว + ประวัติ ตารางเดียวกัน) ใหม่สุดก่อน
 * อ่านโพสต์ได้ = ดูสถานะงานได้ (ปุ่มลองใหม่/ยกเลิกมีด่านของตัวเองที่ /api/posts/jobs/[jobId])
 */
export async function GET(req, { params }) {
  const { id } = await params
  const ctx = await postContext(id)
  if (ctx.error) return ctx.error

  try {
    const jobs = await listJobs(ctx.post.id)
    return Response.json({ success: true, data: jobs })
  } catch (error) {
    console.error('[GET /api/posts/[id]/jobs]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
