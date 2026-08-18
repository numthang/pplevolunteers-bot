// /api/kanban/fields/[id]/options — ตัวเลือกของ select/multi_select field
//
// GET   → { options }  ตัวเลือกทั้งหมดของ field นี้ (การ์ด AGG คืนมาแค่ตัวที่เลือกไว้ กล่องต้องเห็นทั้งชุด)
// POST  { name } → สร้าง/หาตัวเลือกเดิม (พิมพ์ในกล่องแล้ว "สร้างตัวเลือกใหม่") → { option }
// PATCH { reorder: [id,...] } → ลากจัดลำดับใหม่ (ส่งลำดับเต็มของตัวเลือกที่ยังไม่ซ่อนทั้งหมด) → { ok }
//
// ⛔ ไม่มี admin gate — ใครก็ตามที่อยู่ใน org ทำได้จากใน combobox ของการ์ดตรงๆ
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import * as fieldDB from '@/db/kanban/fields.js'

async function loadField(ctx, id) {
  const fieldId = String(id || '').trim()
  if (!/^\d+$/.test(fieldId)) return null
  return await fieldDB.getFieldDef(ctx.orgId, fieldId)
}

export async function GET(_req, { params }) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const field = await loadField(ctx, (await params).id)
  if (!field) return err(404, 'ไม่พบช่องข้อมูลนี้')
  return Response.json({ options: await fieldDB.listFieldOptions(field.id) })
}

export async function POST(req, { params }) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const field = await loadField(ctx, (await params).id)
  if (!field) return err(404, 'ไม่พบช่องข้อมูลนี้')
  if (!['select', 'multi_select'].includes(field.type)) return err(400, 'ช่องข้อมูลนี้ไม่มีตัวเลือก')

  const name = String((await req.json().catch(() => ({}))).name || '').trim()
  if (!name) return err(400, 'ต้องมีชื่อตัวเลือก')
  if (name.length > 60) return err(400, 'ชื่อตัวเลือกยาวเกิน 60 ตัวอักษร')

  const option = await fieldDB.ensureFieldOption(field.id, name)
  if (!option) return err(400, 'สร้างตัวเลือกไม่สำเร็จ')
  return Response.json({ option }, { status: 201 })
}

export async function PATCH(req, { params }) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const field = await loadField(ctx, (await params).id)
  if (!field) return err(404, 'ไม่พบช่องข้อมูลนี้')

  const body = await req.json().catch(() => ({}))
  if (!Array.isArray(body.reorder)) return err(400, 'ต้องมี reorder เป็นรายการ')

  // ⚠️ id เป็น BIGINT → pg คืนมาเป็นสตริง กรองขยะทิ้งก่อนส่งเข้า SQL (แนวเดียวกับ labelIds ของการ์ด)
  const orderedIds = body.reorder.map((x) => String(x).trim()).filter((x) => /^\d+$/.test(x))
  await fieldDB.reorderFieldOptions(field.id, orderedIds)
  return Response.json({ ok: true })
}
