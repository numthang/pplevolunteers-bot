// /api/kanban/fields/[id] — แก้ field def 1 ตัว
//
// PATCH  { label?, helpText?, archived? } → { field }
// GET    ?impact=1                        → { impact }   นับก่อนถามในกล่องยืนยัน
// DELETE                                  → { ok }       ลบถาวร (admin · ต้องซ่อนไว้ก่อน)
//
// ⛔ key และ type เปลี่ยนไม่ได้ในรอบนี้ — ไม่รับพารามิเตอร์นี้เข้ามาด้วยซ้ำ (กันแก้ผิดที่)
// ⛔ PATCH ไม่มี admin gate (เคาะ 2026-08-18 รอบเย็น) — ใครก็ตามที่อยู่ใน org แก้ได้จากใน CardModal
// ⚠️ **DELETE ต่างออกไป** — ลบถาวร ย้อนไม่ได้ จึงเป็น admin เท่านั้น (canPurge) และต้องซ่อนไว้ก่อน
//    ห้ามลาม gate นี้ไปที่ PATCH เด็ดขาด (แก้ชื่อ/ซ่อน = ย้อนได้ ไม่ต้องคุม)
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { canPurge } from '@/lib/kanbanAccess.js'
import * as fieldDB from '@/db/kanban/fields.js'

/** id เป็น BIGINT → มาเป็นสตริง ห้ามแปลงเป็น Number */
const parseFieldId = (id) => {
  const v = String(id || '').trim()
  return /^\d+$/.test(v) ? v : null
}

export async function GET(req, { params }) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const fieldId = parseFieldId((await params).id)
  if (!fieldId) return err(404, 'ไม่พบช่องข้อมูลนี้')
  if (new URL(req.url).searchParams.get('impact') !== '1') return err(400, 'ต้องระบุ impact=1')

  return Response.json({ impact: await fieldDB.countFieldImpact(ctx.orgId, fieldId) })
}

/** ลบถาวร — ต้องซ่อน (archived) ไว้ก่อน · ค่าที่การ์ดกรอกไว้หายตาม CASCADE ทั้งหมด */
export async function DELETE(_req, { params }) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error
  if (!canPurge(ctx.access)) return err(403, 'ลบถาวรได้เฉพาะแอดมิน')

  const fieldId = parseFieldId((await params).id)
  if (!fieldId) return err(404, 'ไม่พบช่องข้อมูลนี้')

  const ok = await fieldDB.deleteFieldDef(ctx.orgId, fieldId)
  if (!ok) return err(400, 'ต้องซ่อนช่องข้อมูลนี้ก่อนถึงจะลบถาวรได้')
  return Response.json({ ok: true })
}

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
