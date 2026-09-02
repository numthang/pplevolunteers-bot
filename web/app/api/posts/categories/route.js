import { postsContext } from '@/lib/postsGuard.js'
import { canApprove, isAdmin } from '@/lib/postsAccess.js'
import * as postDB from '@/db/posts/episodes.js'

/**
 * GET /api/posts/categories?visibility=personal|org&source=backfill
 * ไม่ส่ง visibility = หมวดของทุกอันที่มีสิทธิ์เห็น
 * `source` ต้องส่งให้ตรงกับที่ส่งให้ /api/posts — ไม่งั้นตัวเลขบนชิปไม่ตรงกับรายการที่แสดง
 */
export async function GET(req) {
  const ctx = await postsContext()
  if (ctx.error) return ctx.error

  const params = new URL(req.url).searchParams
  const v = params.get('visibility')
  const visibility = ['personal', 'org'].includes(v) ? v : null
  const source = params.get('source') === 'backfill' ? 'backfill' : null

  try {
    const data = await postDB.listCategories(ctx.orgId, ctx.userId, { includeAllPersonal: isAdmin(ctx.access), visibility, source })
    // sourceCounts: ไม่ขึ้นกับ filter ปัจจุบัน — ใช้โชว์ตัวเลขบน option ตัวกรองแหล่งทั้ง 5 ปุ่มเสมอ
    const sourceCounts = await postDB.countPostsBySource(ctx.orgId, ctx.userId, { includeAllPersonal: isAdmin(ctx.access) })
    // statusCounts/stateCounts: scope ตาม visibility/source เดียวกับ data (categories) — ใช้โชว์ตัวเลขบน
    // option ของตัวกรอง "สถานะ" / "ระยะ" (ยังไม่โพสต์/โพสต์แล้ว/ในกรุ)
    const statusCounts = await postDB.countPostsByStatus(ctx.orgId, ctx.userId, { includeAllPersonal: isAdmin(ctx.access), visibility, source })
    const stateCounts = await postDB.countPostsByState(ctx.orgId, ctx.userId, { includeAllPersonal: isAdmin(ctx.access), visibility, source })
    // canManage: หน้า list ไม่มี per-post `can` ให้เช็ค (ไม่ผูกกับโพสต์ใดโพสต์หนึ่ง) — ส่งสิทธิ์เปลี่ยนชื่อหมวดมาด้วยเลย
    // ให้ UI ซ่อนปุ่มได้ตรงกับ pattern เดิม (can.approve/can.promote) แทนที่จะโชว์ปุ่มให้ทุกคนแล้วรอ 403 (/scrutinize 2026-08-01)
    return Response.json({ success: true, data, sourceCounts, statusCounts, stateCounts, canManage: canApprove(ctx.access) })
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
    const updated = await postDB.renameCategory(ctx.orgId, ctx.userId, from, to, { includeAllPersonal: isAdmin(ctx.access) })
    return Response.json({ success: true, data: { updated } })
  } catch (error) {
    console.error('[PATCH /api/posts/categories]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
