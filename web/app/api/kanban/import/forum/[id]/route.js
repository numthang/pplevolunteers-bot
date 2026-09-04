// /api/kanban/import/forum/[id] — แก้ค่าที่จะใช้ตอนนำเข้า / กดไม่เอา
//
// PATCH { title?, detail?, workstreams?, areas?, assigneeUserId?, status? } → { row }
//
// ⚠️ เขียนลง pick_* เท่านั้น ไม่แตะ ai_* — รันสคริปต์ AI ใหม่ทับได้โดยของที่คนแก้ไม่หาย
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { isKanbanAdmin } from '@/lib/kanbanAccess.js'
import * as importDB from '@/db/kanban/forumImport.js'

const ids = (v) => (Array.isArray(v) ? [...new Set(v.map(String).filter((s) => /^\d+$/.test(s)))] : [])

export async function PATCH(req, { params }) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error
  if (!isKanbanAdmin(ctx.access)) return err(403, 'หน้านี้สำหรับผู้ดูแลเท่านั้น')

  const { id } = await params
  const row = await importDB.getImportRow(ctx.orgId, id)
  if (!row) return err(404, 'ไม่พบกระทู้นี้ในรายการ')
  if (row.status === 'imported') return err(400, 'กระทู้นี้นำเข้าไปแล้ว — แก้ที่ตัวการ์ดแทน')

  const body = await req.json().catch(() => ({}))

  if (body.status) {
    const updated = await importDB.setStatus(ctx.orgId, id, body.status)
    if (!updated) return err(400, 'สถานะไม่ถูกต้อง')
    return Response.json({ row: updated })
  }

  const patch = {}
  if ('title' in body) {
    const title = String(body.title ?? '').trim()
    if (!title) return err(400, 'ชื่อว่างไม่ได้')
    patch.title = title.slice(0, 255)
  }
  if ('detail' in body) patch.detail = String(body.detail ?? '').trim() || null
  if ('workstreams' in body) patch.workstreams = ids(body.workstreams)
  if ('areas' in body) patch.areas = ids(body.areas)
  // ใส่ได้หลายคน · [] = ตั้งใจไม่มีใคร (ต่างจากไม่ส่งฟิลด์นี้มา = ยังไม่แตะ ใช้ที่ AI เดา)
  if ('assignees' in body) patch.assignees = ids(body.assignees).map(Number)
  if ('eventDate' in body) {
    const v = String(body.eventDate ?? '').trim()
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return err(400, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')
    patch.eventDate = v || null
    patch.noEventDate = !v
  }

  return Response.json({ row: await importDB.updatePick(ctx.orgId, id, patch) })
}
