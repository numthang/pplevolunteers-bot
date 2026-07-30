import { postsContext } from '@/lib/postsGuard.js'
import { canApprove, isAdmin } from '@/lib/postsAccess.js'
import * as postDB from '@/db/posts/episodes.js'

/**
 * GET /api/posts/categories?visibility=personal|org
 * ไม่ส่ง visibility = หมวดของทุกอันที่มีสิทธิ์เห็น
 */
export async function GET(req) {
  const ctx = await postsContext()
  if (ctx.error) return ctx.error

  const v = new URL(req.url).searchParams.get('visibility')
  const visibility = ['personal', 'org'].includes(v) ? v : null

  try {
    const data = await postDB.listCategories(ctx.orgId, ctx.userId, { includeAllPersonal: isAdmin(ctx.access), visibility })
    return Response.json({ success: true, data })
  } catch (error) {
    console.error('[GET /api/posts/categories]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * PATCH /api/posts/categories — เปลี่ยนชื่อหมวดทั้งกอง { from, to }
 */
export async function PATCH(req) {
  const ctx = await postsContext()
  if (ctx.error) return ctx.error

  if (!canApprove(ctx.access)) {
    return Response.json({ error: 'ไม่มีสิทธิ์เปลี่ยนชื่อหมวด' }, { status: 403 })
  }

  const { from, to } = await req.json().catch(() => ({}))
  if (!from) return Response.json({ error: 'ต้องระบุหมวดเดิม' }, { status: 400 })

  try {
    const updated = await postDB.renameCategory(ctx.orgId, from, to)
    return Response.json({ success: true, data: { updated } })
  } catch (error) {
    console.error('[PATCH /api/posts/categories]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
