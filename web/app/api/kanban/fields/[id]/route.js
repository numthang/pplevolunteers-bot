// /api/kanban/fields/[id] — แก้ field def 1 ตัว
//
// PATCH { label?, helpText?, archived? } → { field }
//
// ⛔ key และ type เปลี่ยนไม่ได้ในรอบนี้ — ไม่รับพารามิเตอร์นี้เข้ามาด้วยซ้ำ (กันแก้ผิดที่)
// ⛔ ไม่มี admin gate (เคาะ 2026-08-18 รอบเย็น) — ใครก็ตามที่อยู่ใน org แก้ได้จากใน CardModal
// ⚠️ ไม่มีทางลบ field ถาวร — ซ่อนอย่างเดียว ค่าที่การ์ดกรอกไว้แล้วห้ามหายเงียบ
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import * as fieldDB from '@/db/kanban/fields.js'

export async function PATCH(req, { params }) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  // ⚠️ id เป็น BIGINT → มาเป็นสตริง ห้ามแปลงเป็น Number
  const { id } = await params
  const fieldId = String(id || '').trim()
  if (!/^\d+$/.test(fieldId)) return err(404, 'ไม่พบช่องข้อมูลนี้')

  const body = await req.json().catch(() => ({}))

  // ซ่อน/เลิกซ่อน เป็น action เดี่ยว ไม่ปนกับการแก้ชื่อ
  if (body.archived !== undefined) {
    const ok = body.archived
      ? await fieldDB.archiveFieldDef(ctx.orgId, fieldId)
      : await fieldDB.unarchiveFieldDef(ctx.orgId, fieldId)
    if (!ok) return err(404, 'ไม่พบช่องข้อมูลนี้ หรือสถานะเป็นแบบนั้นอยู่แล้ว')
    return Response.json({ ok: true })
  }

  const patch = {}
  if (body.label !== undefined) {
    const label = String(body.label).trim()
    if (!label) return err(400, 'ต้องมีชื่อช่องข้อมูล')
    if (label.length > 100) return err(400, 'ชื่อช่องข้อมูลยาวเกิน 100 ตัวอักษร')
    patch.label = label
  }
  if (body.helpText !== undefined) patch.helpText = body.helpText
  if (!Object.keys(patch).length) return err(400, 'ไม่มีอะไรให้แก้')

  const res = await fieldDB.updateFieldDef(ctx.orgId, fieldId, patch)
  if (res.notFound) return err(404, 'ไม่พบช่องข้อมูลนี้')
  return Response.json({ field: res.def })
}
