// /api/kanban/import/forum — รายการกระทู้ที่รอคัดเข้า KANBAN
//
// GET ?status=pending|skipped|imported|all&channel=<id> → { rows, counts, options }
//
// แอดมิน/เลขาธิการ/กรรมการจังหวัด/ผู้ประสานงานจังหวัด — หน้านี้สร้างการ์ดทีละหลายสิบใบเข้ากระดานที่คนทั้ง org เห็น
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { canImportForum } from '@/lib/kanbanAccess.js'
import * as importDB from '@/db/kanban/forumImport.js'
import * as fieldDB from '@/db/kanban/fields.js'
import pool from '@/db/index.js'

export async function GET(req) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error
  if (!canImportForum(ctx.access)) return err(403, 'ไม่มีสิทธิ์ใช้หน้านี้')

  const url = new URL(req.url)
  const rows = await importDB.listImportRows(ctx.orgId, {
    status: url.searchParams.get('status') || 'pending',
    channelId: url.searchParams.get('channel') || null,
  })

  // ตัวเลือกของช่อง "สายงาน"/"พื้นที่" — หน้าเว็บต้องแปลง id ที่ AI เดาไว้เป็นชื่อ และให้คนเลือกเพิ่ม/ถอด
  const defs = await fieldDB.listFieldDefs(ctx.orgId)
  const wanted = defs.filter((d) => ['สายงาน', 'พื้นที่'].includes(d.label))
  const { rows: options } = wanted.length
    ? await pool.query(
        `SELECT id, field_id, name, color FROM kanban_field_options
          WHERE field_id = ANY($1::bigint[]) AND archived_at IS NULL ORDER BY field_id, sort_order`,
        [wanted.map((d) => d.id)]
      )
    : { rows: [] }

  return Response.json({
    rows,
    counts: await importDB.countByStatus(ctx.orgId),
    fields: wanted.map((d) => ({ id: String(d.id), label: d.label })),
    options: options.map((o) => ({ ...o, id: String(o.id), field_id: String(o.field_id) })),
  })
}
