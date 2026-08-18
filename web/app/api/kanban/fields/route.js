// /api/kanban/fields — ช่องข้อมูลตั้งเองของ org (custom field)
//
// GET             → { fields: [...ที่ยังไม่ถูกซ่อน] }  · อ่านได้ทุกคนใน org
// GET ?archived=1  → { fields: [...เฉพาะที่ซ่อนไว้] }   · ใช้วาดหัวข้อ "ซ่อนอยู่" ในกล่องข้อมูลของทีม
// POST → สร้าง field def ใหม่ (label + type) — key สร้างอัตโนมัติ ไม่ต้องกรอก
//
// ⛔ ไม่มี admin gate (เคาะ 2026-08-18 รอบเย็น: "ไม่ต้องมี field manager ให้ยุ่งยาก")
//    ใครก็ตามที่อยู่ใน org สร้าง/แก้ได้จากใน CardModal ตรงๆ — เหมือนป้ายที่เปิดให้ทุกคนสร้างอยู่แล้ว
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { FIELD_TYPES } from '@/lib/kanbanFieldValue.js'
import * as fieldDB from '@/db/kanban/fields.js'

export async function GET(req) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  // ?archived=1 → เอาเฉพาะที่ซ่อนไว้ (listFieldDefs คืนรวมทั้งหมด จึงต้องกรองฝั่งนี้)
  if (new URL(req.url).searchParams.get('archived') === '1') {
    const all = await fieldDB.listFieldDefs(ctx.orgId, { includeArchived: true })
    return Response.json({ fields: all.filter((f) => f.archived_at) })
  }
  return Response.json({ fields: await fieldDB.listFieldDefs(ctx.orgId) })
}

export async function POST(req) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const body = await req.json().catch(() => ({}))

  const label = String(body.label || '').trim()
  if (!label) return err(400, 'ต้องมีชื่อช่องข้อมูล')
  if (label.length > 100) return err(400, 'ชื่อช่องข้อมูลยาวเกิน 100 ตัวอักษร')

  const type = String(body.type || '').trim()
  if (!FIELD_TYPES.includes(type)) return err(400, 'ชนิดข้อมูลไม่ถูกต้อง')

  const helpText = String(body.helpText || '').trim() || null

  const field = await fieldDB.createFieldDef(ctx.orgId, { label, helpText, type })
  return Response.json({ field }, { status: 201 })
}
