// /api/kanban/cards/[id] — อ่าน / แก้ (autosave) / เก็บเข้ากรุ
//
// PATCH รับ 3 แบบ แยกกันชัดเจน ห้ามปนใน request เดียว:
//   { lockToken, title?, detail?, dueAt?, priority?, blocked?, blockedReason? }  ← autosave (ต้องมี token)
//   { statusType }                                                              ← ปุ่มเปลี่ยนสถานะ
//   { ownerUserId } | { claim: true }                                           ← เจ้าภาพ
import { cardContext, err } from '@/lib/kanbanGuard.js'
import {
  canEditCard, canArchiveCard, canChangeStatus, canAssignOwner, canClaimCard,
  checkStatusTransition, formatRef, isKanbanAdmin,
} from '@/lib/kanbanAccess.js'
import * as cardDB from '@/db/kanban/cards.js'

const REASON_TEXT = {
  needOwner:     'ต้องมีเจ้าภาพก่อนถึงจะย้ายออกจากช่องรอทำได้',
  unknownStatus: 'สถานะไม่ถูกต้อง',
}

export async function GET(_req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error
  return Response.json({
    card: ctx.card,
    ref: formatRef(ctx.card.ref_no),
    checklist: await cardDB.listChecklist(ctx.orgId, ctx.card.id),
    can: {
      edit:    canEditCard(ctx.card, ctx.access, ctx.userId),
      // เก็บเข้ากรุ/เอาออกจากกรุ ใช้ด่านเดียวกัน — คนละปุ่มแต่เป็นการกระทำคู่กัน
      archive: canArchiveCard(ctx.card, ctx.access, ctx.userId) && !ctx.card.archived_at,
      restore: canArchiveCard(ctx.card, ctx.access, ctx.userId) && Boolean(ctx.card.archived_at),
      claim:   canClaimCard(ctx.card, ctx.access, ctx.userId),
      // join = ปุ่ม "ลงมือด้วย" ควรโผล่ไหม — claim อย่างเดียวไม่พอ
      // เจ้าภาพ/คนช่วยอยู่แล้วไม่ควรเห็นปุ่มนี้ (จะกลายเป็นเพิ่มตัวเองเป็นคนช่วยของงานตัวเอง)
      join:    canClaimCard(ctx.card, ctx.access, ctx.userId)
               && ctx.card.owner_user_id !== ctx.userId
               && !(ctx.card.helper_ids || []).includes(ctx.userId),
      // ทางเข้าหน้า /kanban/fields ในกล่อง "ข้อมูลของทีม" — โชว์เฉพาะแอดมิน (แนวเดียวกับ manageLabels)
      manageFields: isKanbanAdmin(ctx.access),
    },
  })
}

export async function PATCH(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error

  const body = await req.json().catch(() => ({}))
  const { card, access, userId, orgId } = ctx

  // ── เปลี่ยนสถานะ ──
  if (body.statusType !== undefined) {
    if (!canChangeStatus(card, access, userId)) return err(403, 'ไม่มีสิทธิ์เปลี่ยนสถานะการบ้านใบนี้')
    const gate = checkStatusTransition(card, body.statusType)
    if (!gate.ok) return err(400, REASON_TEXT[gate.reason] || 'ย้ายไม่ได้')
    return Response.json({ card: await cardDB.setCardStatus(orgId, card.id, body.statusType) })
  }

  // ── เอาออกจากกรุ ──
  // ใช้ด่านเดียวกับตอนเก็บเข้ากรุ (canArchiveCard) — คนที่เก็บเข้าได้ต้องเอาออกได้
  if (body.restore === true) {
    if (!canArchiveCard(card, access, userId)) return err(403, 'เอาออกจากกรุได้เฉพาะคนที่สร้างการบ้านใบนี้')
    const ok = await cardDB.unarchiveCard(orgId, card.id)
    if (!ok) return err(400, 'การบ้านใบนี้ไม่ได้อยู่ในกรุ')
    return Response.json({ card: await cardDB.getCard(orgId, card.id) })
  }

  // ── อาสาทำเอง (หลวมกว่า: ใครใน org ก็ได้) ──
  if (body.claim === true) {
    if (!canClaimCard(card, access, userId)) return err(403, 'งานนี้ปิดไปแล้ว')
    if (card.owner_user_id) {
      return Response.json({ card: await cardDB.addHelper(orgId, card.id, userId) })
    }
    await cardDB.setCardOwner(orgId, card.id, userId)
    return Response.json({ card: await cardDB.setCardStatus(orgId, card.id, 'doing') })
  }

  // ── มอบหมายให้คนอื่น / ถอดเจ้าภาพ ──
  if (body.ownerUserId !== undefined) {
    if (!canAssignOwner(card, access, userId)) return err(403, 'ไม่มีสิทธิ์เปลี่ยนเจ้าภาพ')
    const next = body.ownerUserId ? Number(body.ownerUserId) : null
    // สถานะขยับตามเจ้าภาพให้เองใน setCardOwner (ถอด → backlog · ตั้งให้การ์ด backlog → doing)
    // ห้ามย้ายกติกานี้กลับมาไว้ที่นี่ — บอท/cron เรียก db ตรงๆ ไม่ผ่าน route
    return Response.json({ card: await cardDB.setCardOwner(orgId, card.id, next) })
  }

  // ── autosave เนื้อหา ──
  if (!canEditCard(card, access, userId)) return err(403, 'ไม่มีสิทธิ์แก้การบ้านใบนี้')

  const fields = {}
  if (body.title !== undefined) {
    const t = String(body.title).trim()
    if (!t) return err(400, 'ต้องมีชื่อการบ้าน')
    if (t.length > 200) return err(400, 'ชื่อการบ้านยาวเกิน 200 ตัวอักษร')
    fields.title = t
  }
  if (body.detail !== undefined)        fields.detail = body.detail
  if (body.dueAt !== undefined)         fields.due_at = body.dueAt || null   // ⚠️ ส่งดิบ ห้ามแปลง timezone
  if (body.priority !== undefined)      fields.priority = Number(body.priority) || 0
  if (body.blocked !== undefined)       fields.blocked = Boolean(body.blocked)
  if (body.blockedReason !== undefined) fields.blocked_reason = body.blockedReason || null
  if (!Object.keys(fields).length)      return err(400, 'ไม่มีอะไรให้แก้')

  const res = await cardDB.updateCard(orgId, card.id, fields, { lockToken: body.lockToken })
  if (res.notFound) return err(404, 'ไม่พบการบ้านใบนี้')
  // 409 = คนอื่นแก้ไปแล้ว → คืนของจริงใน DB ให้ UI ถามว่าจะโหลดใหม่ไหม (ห้าม last-write-wins)
  if (res.conflict) return Response.json({ error: 'มีคนแก้การบ้านใบนี้ไปแล้ว', card: res.card }, { status: 409 })
  return Response.json({ card: res.card })
}

export async function DELETE(_req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error
  if (!canArchiveCard(ctx.card, ctx.access, ctx.userId)) return err(403, 'เก็บเข้ากรุได้เฉพาะคนที่สร้างการบ้านใบนี้')
  return Response.json({ ok: await cardDB.archiveCard(ctx.orgId, ctx.card.id) })
}
