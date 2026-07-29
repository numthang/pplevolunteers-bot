import { postContext } from '@/lib/postsGuard.js'
import { canPublishPost } from '@/lib/postsAccess.js'
import { getJob, retryJob, cancelJob } from '@/db/posts/jobs.js'

/**
 * POST /api/posts/jobs/[jobId] — { action:'retry'|'cancel' }
 * สิทธิ์ยึดจากโพสต์เจ้าของงาน (canPublishPost) — สั่งโพสต์ได้ = จัดการงานโพสต์นั้นได้
 * งานจากตะกร้าดิสฯ (episode_id = NULL) ไม่มีโพสต์ให้ยึดสิทธิ์ → 404
 */
export async function POST(req, { params }) {
  const { jobId } = await params

  const id = Number(jobId)
  if (!Number.isInteger(id)) return Response.json({ error: 'ไม่พบงานโพสต์' }, { status: 404 })

  const { action } = await req.json().catch(() => ({}))
  if (!['retry', 'cancel'].includes(action)) {
    return Response.json({ error: 'คำสั่งไม่ถูกต้อง' }, { status: 400 })
  }

  try {
    const job = await getJob(id)
    if (!job || !job.episode_id) return Response.json({ error: 'ไม่พบงานโพสต์' }, { status: 404 })

    const ctx = await postContext(job.episode_id)
    if (ctx.error) return ctx.error   // อ่านโพสต์ไม่ได้ / คนละ org = 404 ตามด่านกลาง

    if (!canPublishPost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
      return Response.json({ error: 'ไม่มีสิทธิ์จัดการงานโพสต์นี้' }, { status: 403 })
    }

    const updated = action === 'retry' ? await retryJob(id) : await cancelJob(id)
    if (!updated) {
      return Response.json(
        {
          error: action === 'retry'
            ? 'ลองใหม่ได้เฉพาะงานที่ล้มเหลวหรือเลยเวลา'
            : 'ยกเลิกได้เฉพาะงานที่ยังไม่ถูกส่ง',
        },
        { status: 409 }
      )
    }

    return Response.json({ success: true, data: { job: updated } })
  } catch (error) {
    console.error('[POST /api/posts/jobs/[jobId]]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
