// /api/kanban/cards/[id]/checklist — item ของเช็คลิสต์ (custom field ชนิด checklist)
//
// ผูกกับ field_id เสมอ — การ์ดเดียวมีได้หลายเช็คลิสต์ถ้า org สร้างหลาย field ชนิดนี้ (2026-08-18 รอบเย็น)
//
// GET   ?fieldId=X                → { items }
// POST  { fieldId, text }         → { item }
// PATCH { itemId, done }          → { item }        ติ๊ก/เลิกติ๊ก
// PATCH { fieldId, reorder:[id] } → { ok }           ลากจัดลำดับใหม่
// DELETE ?itemId=X                → { ok }
import { cardContext, err } from '@/lib/kanbanGuard.js'
import { canEditCard } from '@/lib/kanbanAccess.js'
import * as fieldDB from '@/db/kanban/fields.js'

export async function GET(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error

  const fieldId = new URL(req.url).searchParams.get('fieldId')
  if (!fieldId) return err(400, 'ต้องระบุ fieldId')
  return Response.json({ items: await fieldDB.listChecklistItems(ctx.orgId, ctx.card.id, fieldId) })
}

export async function POST(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error
  if (!canEditCard(ctx.card, ctx.access, ctx.userId)) return err(403, 'ไม่มีสิทธิ์แก้การบ้านใบนี้')

  const body = await req.json().catch(() => ({}))
  if (!body.fieldId) return err(400, 'ต้องระบุ fieldId')

  const text = String(body.text || '').trim()
  if (!text) return err(400, 'ต้องมีข้อความ')
  if (text.length > 300) return err(400, 'ข้อความยาวเกิน 300 ตัวอักษร')

  const item = await fieldDB.addChecklistItem(ctx.orgId, ctx.card.id, body.fieldId, text)
  if (!item) return err(404, 'ไม่พบการบ้านใบนี้')
  return Response.json({ item }, { status: 201 })
}

export async function PATCH(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error
  if (!canEditCard(ctx.card, ctx.access, ctx.userId)) return err(403, 'ไม่มีสิทธิ์แก้การบ้านใบนี้')

  const body = await req.json().catch(() => ({}))

  // ลากจัดลำดับใหม่
  if (Array.isArray(body.reorder)) {
    if (!body.fieldId) return err(400, 'ต้องระบุ fieldId')
    const orderedIds = body.reorder.map((x) => String(x).trim()).filter((x) => /^\d+$/.test(x))
    const ok = await fieldDB.reorderChecklistItems(ctx.orgId, ctx.card.id, body.fieldId, orderedIds)
    if (!ok) return err(404, 'ไม่พบการบ้านใบนี้')
    return Response.json({ ok: true })
  }

  // ติ๊ก/เลิกติ๊ก
  if (!body.itemId) return err(400, 'ต้องระบุงานย่อย')
  const item = await fieldDB.setChecklistItemDone(ctx.orgId, body.itemId, Boolean(body.done))
  return item ? Response.json({ item }) : err(404, 'ไม่พบงานย่อยนี้')
}

export async function DELETE(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error
  if (!canEditCard(ctx.card, ctx.access, ctx.userId)) return err(403, 'ไม่มีสิทธิ์แก้การบ้านใบนี้')

  const itemId = new URL(req.url).searchParams.get('itemId')
  if (!itemId) return err(400, 'ต้องระบุงานย่อย')
  return Response.json({ ok: await fieldDB.deleteChecklistItem(ctx.orgId, itemId) })
}
