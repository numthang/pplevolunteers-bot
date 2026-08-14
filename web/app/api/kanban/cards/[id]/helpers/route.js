// /api/kanban/cards/[id]/helpers — คนช่วย
//
// POST ไม่มี body = "ฉันขอลงมือด้วย" (grill ข้อ 8 — อาสาเองได้ ไม่ต้องรอใครมอบหมาย)
// POST { userId } = ดึงคนอื่นเข้ามาช่วย → ต้องมีสิทธิ์แก้การ์ด
import { cardContext, err } from '@/lib/kanbanGuard.js'
import { canEditCard, canClaimCard } from '@/lib/kanbanAccess.js'
import * as cardDB from '@/db/kanban/cards.js'

export async function POST(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error

  const target = (await req.json().catch(() => ({}))).userId
  if (target && Number(target) !== ctx.userId) {
    if (!canEditCard(ctx.card, ctx.access, ctx.userId)) return err(403, 'ไม่มีสิทธิ์เพิ่มคนช่วยในการบ้านใบนี้')
    return Response.json({ card: await cardDB.addHelper(ctx.orgId, ctx.card.id, Number(target)) })
  }

  if (!canClaimCard(ctx.card, ctx.access, ctx.userId)) return err(403, 'งานนี้ปิดไปแล้ว')
  return Response.json({ card: await cardDB.addHelper(ctx.orgId, ctx.card.id, ctx.userId) })
}

export async function DELETE(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error

  const target = Number(new URL(req.url).searchParams.get('userId')) || ctx.userId
  // ถอนตัวเองออกได้เสมอ · ถอดคนอื่นต้องมีสิทธิ์แก้
  if (target !== ctx.userId && !canEditCard(ctx.card, ctx.access, ctx.userId)) {
    return err(403, 'ไม่มีสิทธิ์ถอดคนช่วยออกจากการบ้านใบนี้')
  }
  return Response.json({ card: await cardDB.removeHelper(ctx.orgId, ctx.card.id, target) })
}
