// /api/kanban/import/forum/commit — สร้างการ์ดจากกระทู้ที่คัดไว้
//
// POST { ids: [id, ...] } → { created, failed }
//
// ⭐ ตรรกะทั้งหมดอยู่ที่ lib/forumImportCommit.js — route มีหน้าที่แค่ด่านสิทธิ์กับแปลง input
//    (แยกไว้เพื่อให้สโมครันได้โดยไม่ต้องมี session จริง)
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { isKanbanAdmin } from '@/lib/kanbanAccess.js'
import { commitImportRows } from '@/lib/forumImportCommit.js'

export async function POST(req) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error
  if (!isKanbanAdmin(ctx.access)) return err(403, 'หน้านี้สำหรับผู้ดูแลเท่านั้น')

  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter((s) => /^\d+$/.test(s)) : []
  if (!ids.length) return err(400, 'ยังไม่ได้เลือกกระทู้')

  return Response.json(await commitImportRows(ctx.orgId, ids, ctx.userId))
}
