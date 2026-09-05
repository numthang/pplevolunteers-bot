// /api/kanban/import/forum — รายการกระทู้ที่รอคัดเข้า KANBAN
//
// GET ?status=pending|skipped|imported|all&channel=<id>&edited=1&limit=20&offset=0 → { rows, total, counts, options }
//   limit/offset = ทยอยโหลดทีละหน้า — 246 ใบส่งรวดเดียวคือ 846 KB + DOM 246 แถว (วัดจริง 2026-09-05)
//   edited=1 = เอาเฉพาะใบที่มีคนแก้ไว้แล้ว (หลายมือช่วยกันคัด — คนกดนำเข้าดูแค่ใบที่ตรวจแล้ว)
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
  const filters = {
    status: url.searchParams.get('status') || 'pending',
    channelId: url.searchParams.get('channel') || null,
    editedOnly: url.searchParams.get('edited') === '1',
  }
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 100)
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)
  const rows = await importDB.listImportRows(ctx.orgId, { ...filters, limit, offset })
  const total = await importDB.countImportRows(ctx.orgId, filters)

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
    total,
    counts: await importDB.countByStatus(ctx.orgId),
    fields: wanted.map((d) => ({ id: String(d.id), label: d.label })),
    options: options.map((o) => ({ ...o, id: String(o.id), field_id: String(o.field_id) })),
  })
}
