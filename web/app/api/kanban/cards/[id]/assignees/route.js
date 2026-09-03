// /api/kanban/cards/[id]/assignees — ผู้รับผิดชอบการ์ด
//
// POST ไม่มี body = "ฉันขอลงมือด้วย" (grill ข้อ 8 — อาสาเองได้ ไม่ต้องรอใครมอบหมาย)
// POST { userId } = มอบหมายคนอื่น → ต้องมีสิทธิ์แก้การ์ด
// DELETE ?userId= = ถอดคนออก (ถอนตัวเองได้เสมอ · ถอดคนอื่นต้องมีสิทธิ์แก้)
//
// ⭐ 2026-09-03 (เฟส B) — เดิมชื่อ `/helpers` และมี `PATCH { ownerUserId }` เป็นอีกทางคู่กัน
//    ตอนนี้เหลือทางเดียว: ผู้รับผิดชอบทุกคนเท่ากันหมด ไม่มีเจ้าภาพ/ผู้ช่วยอีกแล้ว
//
// ⭐ การ์ดที่ผูกเคส: ผู้รับผิดชอบก็คือ `case_assignees` — เขียนที่ต้นทางเสมอ
//    เขียน kanban_card_assignees ตรงๆ = ดริฟต์กลับมาทันที (สำเนาไม่ตรงต้นทาง)
import { cardContext, err } from '@/lib/kanbanGuard.js'
import { canAssign, canEditCard, canClaimCard } from '@/lib/kanbanAccess.js'
import * as cardDB from '@/db/kanban/cards.js'
import { assignCase, unassignCase, caseOfCard } from '@/lib/caseAssign.js'

export async function POST(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error

  const target = (await req.json().catch(() => ({}))).userId
  if (target && Number(target) !== ctx.userId) {
    if (!canAssign(ctx.card, ctx.access, ctx.userId)) return err(403, 'ไม่มีสิทธิ์เพิ่มผู้รับผิดชอบในKANBANใบนี้')
    const linked = await caseOfCard(ctx.orgId, ctx.card)
    if (linked) {
      await assignCase(ctx.orgId, linked, Number(target), { actorUserId: ctx.userId, app: 'kanban' })
      return Response.json({ card: await cardDB.getCard(ctx.orgId, ctx.card.id) })
    }
    return Response.json({ card: await cardDB.addAssignee(ctx.orgId, ctx.card.id, Number(target)) })
  }

  // เติมตัวเอง: คนเกี่ยวข้องอยู่แล้ว (ผู้รับผิดชอบ/คนสร้าง) แก้การ์ดได้เสมอไม่ว่าสถานะไหน — เหมือนเพิ่มคนอื่น
  // ใครก็ได้ใน org ต้องผ่าน canClaimCard (ห้ามอาสาในงานที่ปิดไปแล้ว)
  // ⚠️ เดิมใช้ canClaimCard เป็นด่านเดียว → คนที่ถืองานอยู่เพิ่มตัวเองเข้าการ์ด "เสร็จ/พักไว้" ของตัวเองไม่ได้
  //    ทั้งที่เพิ่มคนอื่นเข้าการ์ดเดียวกันได้ปกติ (bug จาก user 2026-08-24)
  if (!canEditCard(ctx.card, ctx.access, ctx.userId) && !canClaimCard(ctx.card, ctx.access, ctx.userId)) {
    return err(403, 'งานนี้ปิดไปแล้ว')
  }
  const linkedSelf = await caseOfCard(ctx.orgId, ctx.card)
  if (linkedSelf) {
    await assignCase(ctx.orgId, linkedSelf, ctx.userId, { actorUserId: ctx.userId, app: 'kanban' })
    return Response.json({ card: await cardDB.getCard(ctx.orgId, ctx.card.id) })
  }
  return Response.json({ card: await cardDB.addAssignee(ctx.orgId, ctx.card.id, ctx.userId) })
}

export async function DELETE(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error

  const target = Number(new URL(req.url).searchParams.get('userId')) || ctx.userId
  // ถอนตัวเองออกได้เสมอ · ถอดคนอื่นต้องมีสิทธิ์แก้
  if (target !== ctx.userId && !canAssign(ctx.card, ctx.access, ctx.userId)) {
    return err(403, 'ไม่มีสิทธิ์ถอดผู้รับผิดชอบออกจากKANBANใบนี้')
  }
  const linkedDel = await caseOfCard(ctx.orgId, ctx.card)
  if (linkedDel) {
    await unassignCase(ctx.orgId, linkedDel, target, { actorUserId: ctx.userId, app: 'kanban' })
    return Response.json({ card: await cardDB.getCard(ctx.orgId, ctx.card.id) })
  }
  // ⭐ ไม่ต้อง clamp สถานะเอง — trigger `trg_kanban_assignees_clamp` ดันการ์ดกลับ "รอทำ" ให้
  //    ถ้าคนที่ถอดออกเป็นคนสุดท้าย (เดิม logic นี้ก็อปอยู่ทั้งฝั่งเว็บและฝั่งบอท)
  return Response.json({ card: await cardDB.removeAssignee(ctx.orgId, ctx.card.id, target) })
}
