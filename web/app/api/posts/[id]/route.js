import { postContext, editorName } from '@/lib/postsGuard.js'
import { canEditPost, canWritePost, canDeletePost, canPublishPost, canApprove, canRequestChanges, canPromoteToOrg } from '@/lib/postsAccess.js'
import { canAssignPost, canSelfAssignPost } from '@/lib/postAssign.js'
import * as postDB from '@/db/posts/episodes.js'
import { listMedia } from '@/db/posts/media.js'

/**
 * GET /api/posts/[id]
 */
export async function GET(req, { params }) {
  const { id } = await params
  const ctx = await postContext(id)
  if (ctx.error) return ctx.error

  try {
    const media = await listMedia(ctx.post.id)
    const usage = await postDB.getPostUsage(ctx.post.id)
    const can = {
      edit: canEditPost(ctx.post, ctx.access, ctx.userId, ctx.policy),
      delete: canDeletePost(ctx.post, ctx.access, ctx.userId),
      publish: canPublishPost(ctx.post, ctx.access, ctx.userId, ctx.policy),
      approve: canApprove(ctx.post, ctx.access, ctx.userId, ctx.policy),
      requestChanges: canRequestChanges(ctx.post, ctx.access, ctx.userId, ctx.policy),
      promote: canPromoteToOrg(ctx.post, ctx.access, ctx.userId, usage),
      // มอบหมาย/ถอดคนอื่นได้ = เขียนโพสต์ใบนี้ได้ · ร่างส่วนตัวใส่คนอื่นไม่ได้ (lib/postAssign.js)
      // ⛔ ห้ามเปลี่ยนตัวนี้เป็น canSelfAssignPost — มันคือด่านของ combobox "เพิ่มคนอื่น" ในแผงขวา
      assign: canAssignPost(ctx.post) && canWritePost(ctx.post, ctx.access, ctx.userId, ctx.policy),
      // ⭐ กดรับงานเองได้ไหม (2026-09-04) — เจ้าของร่างส่วนตัวรับงานตัวเองได้ตั้งแต่ยังไม่เปิดให้ทีมเห็น
      claim: canSelfAssignPost(ctx.post, ctx.userId),
    }
    // ⚠️ ต้อง gate ด้วย canSelfAssignPost ไม่ใช่ canAssignPost — เจ้าของร่างส่วนตัวที่กดรับไปแล้ว
    //    ต้องเห็นชื่อตัวเองกลับมา ไม่งั้นกดติดจริงแต่แผงขวายังขึ้น "ยังไม่มีผู้รับผิดชอบ" = ดูเหมือนปุ่มพัง
    const assignees = canSelfAssignPost(ctx.post, ctx.userId) || canAssignPost(ctx.post)
      ? await postDB.getPostAssignees(ctx.post.id, ctx.orgId)
      : []
    // ฉันอยู่ในลิสต์หรือยัง — ปุ่ม "รับงาน/ถอนตัว" ในแผงขวาสลับด้วยค่านี้ (ทรงเดียวกับ isAssigned ของเคส)
    const mine = assignees.some((a) => Number(a.user_id) === Number(ctx.userId))
    return Response.json({ success: true, data: { post: ctx.post, media, can, assignees, mine } })
  } catch (error) {
    console.error('[GET /api/posts/[id]]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * PATCH /api/posts/[id] — autosave { lockToken, title?, body?, bodies?, format?, category? }
 */
export async function PATCH(req, { params }) {
  const { id } = await params
  const ctx = await postContext(id)
  if (ctx.error) return ctx.error

  if (!canEditPost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    // แยก 2 เหตุให้ user รู้ว่าต้องทำอะไรต่อ — "อนุมัติแล้ว" แก้ได้ด้วยปุ่มขอแก้ แต่ "ไม่มีสิทธิ์" ทำอะไรไม่ได้
    const msg = canWritePost(ctx.post, ctx.access, ctx.userId, ctx.policy)
      ? 'โพสต์นี้อนุมัติแล้ว ต้องกด "ขอแก้" ก่อน'
      : 'ไม่มีสิทธิ์แก้โพสต์นี้'
    return Response.json({ error: msg }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { lockToken, title, bodies, format, category } = body
  const postBody = body.body

  try {
    const result = await postDB.updatePostContent(
      ctx.post.id,
      { title, body: postBody, bodies, format, category },
      { lockToken, editorUserId: ctx.userId, editorName: editorName(ctx.session) }
    )

    if (!result.ok && result.notFound) {
      return Response.json({ error: 'ไม่พบโพสต์' }, { status: 404 })
    }
    if (!result.ok && result.conflict) {
      return Response.json({ error: 'คนอื่นแก้โพสต์นี้ไปแล้ว', conflict: true, data: { post: result.post } }, { status: 409 })
    }
    return Response.json({ success: true, data: { post: result.post } })
  } catch (error) {
    console.error('[PATCH /api/posts/[id]]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * DELETE /api/posts/[id]?permanent=1 — default = archive, permanent=1 = ลบถาวร
 */
export async function DELETE(req, { params }) {
  const { id } = await params
  const ctx = await postContext(id)
  if (ctx.error) return ctx.error

  const { searchParams } = new URL(req.url)
  const permanent = searchParams.get('permanent') === '1'

  try {
    if (permanent) {
      if (!canDeletePost(ctx.post, ctx.access, ctx.userId)) {
        return Response.json({ error: 'ไม่มีสิทธิ์ลบโพสต์นี้' }, { status: 403 })
      }
      if (await postDB.hasPendingJobs(ctx.post.id)) {
        return Response.json({ error: 'มีงานโพสต์ค้างอยู่ในคิว ลบถาวรไม่ได้' }, { status: 409 })
      }
      await postDB.deletePost(ctx.post.id)
      return Response.json({ success: true })
    }

    // เก็บเข้ากรุ (archive) — ใช้ canWritePost ไม่ใช่ canEditPost
    // ไม่งั้นโพสต์ที่ approved แล้วจะ archive ไม่ได้เลย (ล็อกไว้กันแก้ "เนื้อหา" ไม่ใช่กันเก็บเข้ากรุ)
    if (!canWritePost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
      return Response.json({ error: 'ไม่มีสิทธิ์ลบโพสต์นี้' }, { status: 403 })
    }
    await postDB.archivePost(ctx.post.id, true)
    return Response.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/posts/[id]]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
