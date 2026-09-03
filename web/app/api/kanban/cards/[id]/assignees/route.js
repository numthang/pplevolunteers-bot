// /api/kanban/cards/[id]/assignees — ผู้รับผิดชอบการ์ด
//
// POST ไม่มี body = "ฉันขอลงมือด้วย" (grill ข้อ 8 — อาสาเองได้ ไม่ต้องรอใครมอบหมาย)
// POST { userId } = มอบหมายคนอื่น → ต้องมีสิทธิ์แก้การ์ด
// DELETE ?userId= = ถอดคนออก (ถอนตัวเองได้เสมอ · ถอดคนอื่นต้องมีสิทธิ์แก้)
//
// ⭐ 2026-09-03 (เฟส B) — เดิมชื่อ `/helpers` และมี `PATCH { ownerUserId }` เป็นอีกทางคู่กัน
//    ตอนนี้เหลือทางเดียว: ผู้รับผิดชอบทุกคนเท่ากันหมด ไม่มีเจ้าภาพ/ผู้ช่วยอีกแล้ว
//
// ⭐ การ์ดที่ผูกของจริง: ผู้รับผิดชอบอยู่ที่ `case_assignees` / `post_assignees` — เขียนที่ต้นทางเสมอ
//    เขียน kanban_card_assignees ตรงๆ = ดริฟต์กลับมาทันที (สำเนาไม่ตรงต้นทาง)
//    ⭐ ฝั่งโพสต์ต่อเข้ามาในเฟส C (2026-09-03) — ก่อนหน้านั้นกด "รับงาน" บนบอร์ดแล้ว
//       ไม่ย้อนไปเขียน post_episodes เลย → หน้า /posts กับบอร์ดโชว์คนละคน (บั๊กที่งานนี้มาแก้)
import { cardContext, err } from '@/lib/kanbanGuard.js'
import { canAssign, canEditCard, canClaimCard } from '@/lib/kanbanAccess.js'
import * as cardDB from '@/db/kanban/cards.js'
import { assignCase, unassignCase, caseOfCard } from '@/lib/caseAssign.js'
import { assignPost, unassignPost, postOfCard, canAssignPost } from '@/lib/postAssign.js'

/**
 * ต้นทางของการ์ดใบนี้ — คืน `{ kind, row }` หรือ null (การบ้านเปล่า เขียนการ์ดตรงๆ ได้)
 * โพสต์ที่ยังเป็นร่างส่วนตัวไม่มีผู้รับผิดชอบ → 400 ไม่ใช่เขียนลงการ์ดเงียบๆ
 * (การ์ดของร่างส่วนตัวมีเจ้าของคนเดียวเห็น — ยัดคนลงไปแล้วสำเนาจะไม่มีวันตรงต้นทาง)
 */
async function sourceOfCard(ctx) {
  const caseRow = await caseOfCard(ctx.orgId, ctx.card)
  if (caseRow) return { kind: 'case', row: caseRow }
  const post = await postOfCard(ctx.orgId, ctx.card)
  if (post) {
    if (!canAssignPost(post)) return { kind: 'blocked', error: err(400, 'ร่างส่วนตัวยังไม่มีผู้รับผิดชอบ — เปิดให้ทีมเห็นก่อน') }
    return { kind: 'post', row: post }
  }
  return null
}

export async function POST(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error

  const target = (await req.json().catch(() => ({}))).userId
  if (target && Number(target) !== ctx.userId) {
    if (!canAssign(ctx.card, ctx.access, ctx.userId)) return err(403, 'ไม่มีสิทธิ์เพิ่มผู้รับผิดชอบในKANBANใบนี้')
    const src = await sourceOfCard(ctx)
    if (src?.error) return src.error
    if (src?.kind === 'case') await assignCase(ctx.orgId, src.row, Number(target), { actorUserId: ctx.userId, app: 'kanban' })
    else if (src?.kind === 'post') await assignPost(ctx.orgId, src.row, Number(target), { actorUserId: ctx.userId, app: 'kanban' })
    else return Response.json({ card: await cardDB.addAssignee(ctx.orgId, ctx.card.id, Number(target)) })
    return Response.json({ card: await cardDB.getCard(ctx.orgId, ctx.card.id) })
  }

  // เติมตัวเอง: คนเกี่ยวข้องอยู่แล้ว (ผู้รับผิดชอบ/คนสร้าง) แก้การ์ดได้เสมอไม่ว่าสถานะไหน — เหมือนเพิ่มคนอื่น
  // ใครก็ได้ใน org ต้องผ่าน canClaimCard (ห้ามอาสาในงานที่ปิดไปแล้ว)
  // ⚠️ เดิมใช้ canClaimCard เป็นด่านเดียว → คนที่ถืองานอยู่เพิ่มตัวเองเข้าการ์ด "เสร็จ/พักไว้" ของตัวเองไม่ได้
  //    ทั้งที่เพิ่มคนอื่นเข้าการ์ดเดียวกันได้ปกติ (bug จาก user 2026-08-24)
  if (!canEditCard(ctx.card, ctx.access, ctx.userId) && !canClaimCard(ctx.card, ctx.access, ctx.userId)) {
    return err(403, 'งานนี้ปิดไปแล้ว')
  }
  const srcSelf = await sourceOfCard(ctx)
  if (srcSelf?.error) return srcSelf.error
  if (srcSelf?.kind === 'case') await assignCase(ctx.orgId, srcSelf.row, ctx.userId, { actorUserId: ctx.userId, app: 'kanban' })
  else if (srcSelf?.kind === 'post') await assignPost(ctx.orgId, srcSelf.row, ctx.userId, { actorUserId: ctx.userId, app: 'kanban' })
  else return Response.json({ card: await cardDB.addAssignee(ctx.orgId, ctx.card.id, ctx.userId) })
  return Response.json({ card: await cardDB.getCard(ctx.orgId, ctx.card.id) })
}

export async function DELETE(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error

  const target = Number(new URL(req.url).searchParams.get('userId')) || ctx.userId
  // ถอนตัวเองออกได้เสมอ · ถอดคนอื่นต้องมีสิทธิ์แก้
  if (target !== ctx.userId && !canAssign(ctx.card, ctx.access, ctx.userId)) {
    return err(403, 'ไม่มีสิทธิ์ถอดผู้รับผิดชอบออกจากKANBANใบนี้')
  }
  const srcDel = await sourceOfCard(ctx)
  if (srcDel?.error) return srcDel.error
  if (srcDel?.kind === 'case') await unassignCase(ctx.orgId, srcDel.row, target, { actorUserId: ctx.userId, app: 'kanban' })
  else if (srcDel?.kind === 'post') await unassignPost(ctx.orgId, srcDel.row, target, { actorUserId: ctx.userId, app: 'kanban' })
  // ⭐ ไม่ต้อง clamp สถานะเอง — trigger `trg_kanban_assignees_clamp` ดันการ์ดกลับ "รอทำ" ให้
  //    ถ้าคนที่ถอดออกเป็นคนสุดท้าย (เดิม logic นี้ก็อปอยู่ทั้งฝั่งเว็บและฝั่งบอท)
  else return Response.json({ card: await cardDB.removeAssignee(ctx.orgId, ctx.card.id, target) })
  return Response.json({ card: await cardDB.getCard(ctx.orgId, ctx.card.id) })
}
