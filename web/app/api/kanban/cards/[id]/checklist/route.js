// /api/kanban/cards/[id]/checklist — งานย่อยในการ์ด
import { cardContext, err } from '@/lib/kanbanGuard.js'
import { canEditCard } from '@/lib/kanbanAccess.js'
import * as cardDB from '@/db/kanban/cards.js'

export async function GET(_req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error
  return Response.json({ items: await cardDB.listChecklist(ctx.orgId, ctx.card.id) })
}

export async function POST(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error
  if (!canEditCard(ctx.card, ctx.access, ctx.userId)) return err(403, 'ไม่มีสิทธิ์แก้การบ้านใบนี้')

  const text = String((await req.json().catch(() => ({}))).text || '').trim()
  if (!text) return err(400, 'ต้องมีข้อความ')
  if (text.length > 300) return err(400, 'ข้อความยาวเกิน 300 ตัวอักษร')

  return Response.json({ item: await cardDB.addChecklistItem(ctx.orgId, ctx.card.id, text) }, { status: 201 })
}

export async function PATCH(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error
  if (!canEditCard(ctx.card, ctx.access, ctx.userId)) return err(403, 'ไม่มีสิทธิ์แก้การบ้านใบนี้')

  const body = await req.json().catch(() => ({}))
  if (!body.itemId) return err(400, 'ต้องระบุงานย่อย')
  // setChecklistDone มี org_id + JOIN การ์ดใน WHERE → itemId ของ org อื่นคืน null เอง
  const item = await cardDB.setChecklistDone(ctx.orgId, body.itemId, Boolean(body.done))
  return item ? Response.json({ item }) : err(404, 'ไม่พบงานย่อยนี้')
}

export async function DELETE(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error
  if (!canEditCard(ctx.card, ctx.access, ctx.userId)) return err(403, 'ไม่มีสิทธิ์แก้การบ้านใบนี้')

  const itemId = new URL(req.url).searchParams.get('itemId')
  if (!itemId) return err(400, 'ต้องระบุงานย่อย')
  return Response.json({ ok: await cardDB.deleteChecklistItem(ctx.orgId, itemId) })
}
