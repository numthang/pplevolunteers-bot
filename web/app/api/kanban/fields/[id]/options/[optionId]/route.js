// /api/kanban/fields/[id]/options/[optionId] — แก้/ซ่อนตัวเลือก 1 ตัว
//
// PATCH { name?, color?, archived? } → { option }
//
// ⚠️ "ลบตัวเลือก" ในกล่อง (เมนู "...") = archive จริงๆ ไม่ใช่ลบถาวร — กันการ์ดที่เลือกไว้แล้วข้อมูลหายเงียบ
//    (บทเรียนเดียวกับป้าย) ผลลัพธ์ที่ผู้ใช้เห็นเหมือนกัน: ตัวเลือกหายจากรายการให้เลือกทันที
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { LABEL_PALETTE } from '@/lib/kanbanLabelColors.js'
import * as fieldDB from '@/db/kanban/fields.js'

export async function PATCH(req, { params }) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const { id, optionId } = await params
  const fieldId = String(id || '').trim()
  const optId = String(optionId || '').trim()
  if (!/^\d+$/.test(fieldId) || !/^\d+$/.test(optId)) return err(404, 'ไม่พบตัวเลือกนี้')

  const field = await fieldDB.getFieldDef(ctx.orgId, fieldId)
  if (!field) return err(404, 'ไม่พบช่องข้อมูลนี้')

  const body = await req.json().catch(() => ({}))

  if (body.archived !== undefined) {
    const ok = body.archived ? await fieldDB.archiveFieldOption(field.id, optId) : false
    if (!ok) return err(404, 'ไม่พบตัวเลือกนี้ หรือถูกซ่อนไปแล้ว')
    return Response.json({ ok: true })
  }

  const patch = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return err(400, 'ต้องมีชื่อตัวเลือก')
    if (name.length > 60) return err(400, 'ชื่อตัวเลือกยาวเกิน 60 ตัวอักษร')
    patch.name = name
  }
  if (body.color !== undefined) {
    const color = body.color || null
    if (color && !LABEL_PALETTE.includes(color)) return err(400, 'สีนี้ไม่อยู่ในคลังสี')
    patch.color = color
  }
  if (!Object.keys(patch).length) return err(400, 'ไม่มีอะไรให้แก้')

  const res = await fieldDB.updateFieldOption(field.id, optId, patch)
  if (res.notFound)  return err(404, 'ไม่พบตัวเลือกนี้')
  if (res.duplicate) return err(409, 'มีตัวเลือกชื่อนี้อยู่แล้ว')
  return Response.json({ option: res.option })
}
