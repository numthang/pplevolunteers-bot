// /api/kanban/fields — ช่องข้อมูลตั้งเองของ org (custom field ก้อน 2)
//
// GET              → { fields: [...ที่ยังไม่ถูกซ่อน], canManage }  · อ่านได้ทุกคนใน org (ต้องเห็นฟอร์มในการ์ด)
// GET ?view=manage → { fields: [...รวมที่ซ่อน + value_count] }     · admin เท่านั้น
// POST             → สร้าง field def ใหม่                          · admin เท่านั้น (ต่างจากป้ายที่ทุกคนสร้างได้ —
//                    field เป็นโครงสร้างข้อมูลของ org ทั้งใบ ไม่ใช่คำศัพท์กลางที่อยากให้ครบตอนใช้งาน)
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { isKanbanAdmin } from '@/lib/kanbanAccess.js'
import { FIELD_TYPES, isValidFieldKey } from '@/lib/kanbanFieldValue.js'
import * as fieldDB from '@/db/kanban/fields.js'

export async function GET(req) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  if (new URL(req.url).searchParams.get('view') === 'manage') {
    if (!isKanbanAdmin(ctx.access)) return err(403, 'ต้องเป็นแอดมินถึงจะจัดการช่องข้อมูลได้')
    return Response.json({ fields: await fieldDB.listFieldDefsWithCounts(ctx.orgId) })
  }

  return Response.json({
    fields: await fieldDB.listFieldDefs(ctx.orgId),
    canManage: isKanbanAdmin(ctx.access),
  })
}

export async function POST(req) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error
  if (!isKanbanAdmin(ctx.access)) return err(403, 'ต้องเป็นแอดมินถึงจะสร้างช่องข้อมูลได้')

  const body = await req.json().catch(() => ({}))

  const key = String(body.key || '').trim().toLowerCase()
  if (!isValidFieldKey(key)) return err(400, 'key ต้องขึ้นต้นด้วยตัวอักษร a-z ตามด้วย a-z0-9_ ไม่เกิน 50 ตัว')

  const label = String(body.label || '').trim()
  if (!label) return err(400, 'ต้องมีชื่อช่องข้อมูล')
  if (label.length > 100) return err(400, 'ชื่อช่องข้อมูลยาวเกิน 100 ตัวอักษร')

  const type = String(body.type || '').trim()
  if (!FIELD_TYPES.includes(type)) return err(400, 'ชนิดข้อมูลไม่ถูกต้อง')

  const helpText = String(body.helpText || '').trim() || null

  const res = await fieldDB.createFieldDef(ctx.orgId, { key, label, helpText, type })
  if (!res.ok) return err(409, 'มีช่องข้อมูล key นี้อยู่แล้ว')
  return Response.json({ field: res.def }, { status: 201 })
}
