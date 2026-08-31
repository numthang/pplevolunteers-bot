// /api/kanban/cards/[id]/helpers — คนช่วย
//
// POST ไม่มี body = "ฉันขอลงมือด้วย" (grill ข้อ 8 — อาสาเองได้ ไม่ต้องรอใครมอบหมาย)
// POST { userId } = ดึงคนอื่นเข้ามาช่วย → ต้องมีสิทธิ์แก้การ์ด
import { cardContext, err } from '@/lib/kanbanGuard.js'
import { canEditCard, canClaimCard } from '@/lib/kanbanAccess.js'
import * as cardDB from '@/db/kanban/cards.js'
import { assignCase, unassignCase, caseOfCard } from '@/lib/caseAssign.js'

/**
 * ⭐ การ์ดที่ผูกเคส: "คนช่วย" ก็คือ `case_assignees` คนที่ไม่ใช่คนแรก — เขียนที่ต้นทางเสมอ
 *    เขียน kanban_card_helpers ตรงๆ = ดริฟต์กลับมาทันที (สำเนาไม่ตรงต้นทาง)
 */

export async function POST(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error

  const target = (await req.json().catch(() => ({}))).userId
  if (target && Number(target) !== ctx.userId) {
    if (!canEditCard(ctx.card, ctx.access, ctx.userId)) return err(403, 'ไม่มีสิทธิ์เพิ่มคนช่วยในการบ้านใบนี้')
    const linked = await caseOfCard(ctx.orgId, ctx.card)
    if (linked) {
      await assignCase(ctx.orgId, linked, Number(target), { actorUserId: ctx.userId, app: 'kanban' })
      return Response.json({ card: await cardDB.getCard(ctx.orgId, ctx.card.id) })
    }
    return Response.json({ card: await cardDB.addHelper(ctx.orgId, ctx.card.id, Number(target)) })
  }

  // เติมตัวเองเป็นคนช่วย: คนเกี่ยวข้องอยู่แล้ว (เจ้าภาพ/คนสร้าง) แก้การ์ดได้เสมอไม่ว่าสถานะไหน — เหมือนเพิ่มคนอื่น
  // ใครก็ได้ใน org ต้องผ่าน canClaimCard (ห้ามอาสาในงานที่ปิดไปแล้ว)
  // ⚠️ เดิมใช้ canClaimCard เป็นด่านเดียว → เจ้าภาพเพิ่มตัวเองเข้าการ์ด "เสร็จ/พักไว้" ของตัวเองไม่ได้
  //    ทั้งที่เพิ่มคนอื่นเข้าการ์ดเดียวกันได้ปกติ (bug จาก user 2026-08-24)
  if (!canEditCard(ctx.card, ctx.access, ctx.userId) && !canClaimCard(ctx.card, ctx.access, ctx.userId)) {
    return err(403, 'งานนี้ปิดไปแล้ว')
  }
  const linkedSelf = await caseOfCard(ctx.orgId, ctx.card)
  if (linkedSelf) {
    await assignCase(ctx.orgId, linkedSelf, ctx.userId, { actorUserId: ctx.userId, app: 'kanban' })
    return Response.json({ card: await cardDB.getCard(ctx.orgId, ctx.card.id) })
  }
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
  const linkedDel = await caseOfCard(ctx.orgId, ctx.card)
  if (linkedDel) {
    await unassignCase(ctx.orgId, linkedDel, target, { actorUserId: ctx.userId, app: 'kanban' })
    return Response.json({ card: await cardDB.getCard(ctx.orgId, ctx.card.id) })
  }
  return Response.json({ card: await cardDB.removeHelper(ctx.orgId, ctx.card.id, target) })
}
