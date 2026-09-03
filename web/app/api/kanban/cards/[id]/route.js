// /api/kanban/cards/[id] — อ่าน / แก้ (autosave) / เก็บเข้ากรุ / ลบถาวร
//
// PATCH รับ 3 แบบ แยกกันชัดเจน ห้ามปนใน request เดียว:
//   { lockToken, title?, detail?, dueAt?, priority? }                           ← autosave (ต้องมี token)
//   { statusType }                                                              ← ปุ่มเปลี่ยนสถานะ
//   { claim: true }                                                             ← อาสารับงานเอง
//
// ⭐ 2026-09-03 (เฟส B): `{ ownerUserId }` ถูกถอดออก — ไม่มี "เจ้าภาพ" ให้ตั้งอีกแล้ว
//    มอบหมาย/ถอดคนอื่นย้ายไปที่ POST/DELETE `/api/kanban/cards/[id]/assignees` ทางเดียว
import { cardContext, err } from '@/lib/kanbanGuard.js'
import {
  canEditCard, canArchiveCard, canChangeStatus, canClaimCard,
  checkStatusTransition, formatRef, canPurge, isLinkedCard, LINK_KIND_LABEL,
} from '@/lib/kanbanAccess.js'
import * as cardDB from '@/db/kanban/cards.js'
import { assignCase, unassignCase, caseOfCard } from '@/lib/caseAssign.js'

// เคสมีผู้รับผิดชอบได้หลายคน — คนที่เพิ่มทีหลังเป็น "ร่วม" ไม่ใช่แทนที่
const CO_ASSIGNEE_NOTICE = 'เคสนี้มีผู้รับผิดชอบอยู่แล้ว — คนที่เพิ่มเข้ามาถูกบันทึกเป็นผู้รับผิดชอบร่วม'

// ⛔ เคยมี needAssignee ("ต้องมีผู้รับผิดชอบก่อนถึงจะย้ายออกจากช่องรอทำได้") — ถอดทิ้งพร้อมกฎ 2026-09-03
const REASON_TEXT = {
  unknownStatus: 'สถานะไม่ถูกต้อง',
  noCard:        'ไม่พบKANBANใบนี้แล้ว (อาจถูกลบไปจากอีกหน้าต่าง)',
}

/** ข้อความบอกว่าทำไมย้ายไม่ได้ — การ์ดที่ผูกของจริงต้องบอกด้วยว่าไปเปลี่ยนที่ไหนแทน */
function transitionError(card, reason) {
  if (reason !== 'linked') return REASON_TEXT[reason] || 'ย้ายไม่ได้'
  const kind = LINK_KIND_LABEL[card.link?.entity_type] || 'ของจริง'
  return `KANBANใบนี้ผูกกับ${kind}อยู่ — สถานะเปลี่ยนที่หน้า${kind}เท่านั้น แล้วการ์ดจะขยับตามเอง`
}

export async function GET(_req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error
  return Response.json({
    card: ctx.card,
    ref: formatRef(ctx.card.ref_no),
    can: {
      edit:    canEditCard(ctx.card, ctx.access, ctx.userId),
      // เก็บเข้ากรุ/เอาออกจากกรุ ใช้ด่านเดียวกัน — คนละปุ่มแต่เป็นการกระทำคู่กัน
      // ⛔ การ์ดที่ผูกของจริง เก็บเข้ากรุ/ลบถาวรจากบอร์ดไม่ได้ — วงจรชีวิตเป็นของต้นทาง
      //    (ลบการ์ดทิ้งแล้ว reconcileEntityCards จะสร้างใบใหม่เลข K ใหม่ ของในการ์ดหายเปล่า)
      archive: canArchiveCard(ctx.card, ctx.access, ctx.userId) && !ctx.card.archived_at && !isLinkedCard(ctx.card),
      // ⚠️ restore ต้อง **ไม่** ติดเงื่อนไข linked — ไม่งั้นการ์ดที่เผลอเก็บเข้ากรุไว้ก่อนหน้านี้ค้างในกรุถาวร
      restore: canArchiveCard(ctx.card, ctx.access, ctx.userId) && Boolean(ctx.card.archived_at),
      claim:   canClaimCard(ctx.card, ctx.access, ctx.userId),
      // join = ปุ่ม "ลงมือด้วย" ควรโผล่ไหม — claim อย่างเดียวไม่พอ
      // คนที่รับผิดชอบอยู่แล้วไม่ควรเห็นปุ่มนี้ (จะกลายเป็นรับงานที่ตัวเองถืออยู่ซ้ำ)
      join:    canClaimCard(ctx.card, ctx.access, ctx.userId)
               && !(ctx.card.assignee_ids || []).includes(ctx.userId),
      // ลบถาวร (การ์ด + custom field) — admin เท่านั้น · UI ซ่อนปุ่มไปเลยถ้าไม่มีสิทธิ์
      // ⚠️ ไม่เกี่ยวกับ edit/archive — คนสร้างการ์ดเก็บเข้ากรุได้ แต่ลบถาวรไม่ได้ถ้าไม่ใช่ admin
      purge:   canPurge(ctx.access) && !isLinkedCard(ctx.card),
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
    if (!canChangeStatus(card, access, userId)) return err(403, 'ไม่มีสิทธิ์เปลี่ยนสถานะKANBANใบนี้')
    const gate = checkStatusTransition(card, body.statusType)
    if (!gate.ok) return err(400, transitionError(card, gate.reason))
    return Response.json({ card: await cardDB.setCardStatus(orgId, card.id, body.statusType) })
  }

  // ── เอาออกจากกรุ ──
  // ใช้ด่านเดียวกับตอนเก็บเข้ากรุ (canArchiveCard) — คนที่เก็บเข้าได้ต้องเอาออกได้
  if (body.restore === true) {
    if (!canArchiveCard(card, access, userId)) return err(403, 'เอาออกจากกรุได้เฉพาะคนที่สร้างKANBANใบนี้')
    const ok = await cardDB.unarchiveCard(orgId, card.id)
    if (!ok) return err(400, 'KANBANใบนี้ไม่ได้อยู่ในกรุ')
    return Response.json({ card: await cardDB.getCard(orgId, card.id) })
  }

  // ── อาสาทำเอง (หลวมกว่า: ใครใน org ก็ได้) ──
  // ⭐ การ์ดที่ผูกของจริงก็รับงานได้ตามปกติ — เจ้าภาพ/คนช่วย/กำหนดส่ง เป็นข้อมูลของ kanban เอง
  //    ที่ล็อกมีแค่ **สถานะกับชื่อ** ซึ่งเป็นของต้นทาง
  if (body.claim === true) {
    if (!canClaimCard(card, access, userId)) return err(403, 'งานนี้ปิดไปแล้ว')

    // ⭐ การ์ดที่ผูกเคส: คนเป็นของ `case_assignees` — เขียนที่ต้นทางแล้วให้ sync ลงการ์ด
    //    (ด่านสิทธิ์ผ่านแล้วตั้งแต่ cardContext → getCardForViewer ซึ่งบังคับ manageCases + จังหวัด)
    const linkedCase = await caseOfCard(orgId, card)
    if (linkedCase) {
      const { wasFirst } = await assignCase(orgId, linkedCase, userId, { actorUserId: userId, app: 'kanban' })
      return Response.json({
        card: await cardDB.getCard(orgId, card.id),
        notice: wasFirst ? undefined : CO_ASSIGNEE_NOTICE,
      })
    }

    // ⭐ เฟส B: ทางเดียวแล้ว — ไม่ต้องแยก "ยังไม่มีเจ้าภาพ = ตั้งเจ้าภาพ" กับ "มีแล้ว = ลงเป็นคนช่วย"
    //    ⛔ รับงานแล้วการ์ด **ไม่ขยับกอง** (ถอดกฎ 2026-09-03) — จะเริ่มทำเมื่อไหร่คนลากเอง
    return Response.json({ card: await cardDB.addAssignee(orgId, card.id, userId) })
  }

  // ── autosave เนื้อหา ──
  if (!canEditCard(card, access, userId)) return err(403, 'ไม่มีสิทธิ์แก้KANBANใบนี้')

  const fields = {}
  if (body.title !== undefined) {
    // ⛔ ชื่อการ์ดที่ผูกของจริงอ่านสดจากต้นทาง — เขียนทับได้ก็ไม่มีผล (ตอนแสดงถูกทับอยู่ดี)
    //    ตอบเหตุผลกลับไปเลย ดีกว่าเงียบแล้วให้ผู้ใช้พิมพ์ทิ้งแล้วเห็นชื่อเดิมเด้งกลับ
    if (isLinkedCard(card)) {
      const kind = LINK_KIND_LABEL[card.link?.entity_type] || 'ของจริง'
      return err(400, `ชื่อKANBANใบนี้มาจาก${kind} — แก้ชื่อที่หน้า${kind} แล้วการ์ดจะเปลี่ยนตามเอง`)
    }
    const t = String(body.title).trim()
    if (!t) return err(400, 'ต้องมีชื่อKANBAN')
    if (t.length > 200) return err(400, 'ชื่อKANBANยาวเกิน 200 ตัวอักษร')
    fields.title = t
  }
  if (body.detail !== undefined)        fields.detail = body.detail
  if (body.dueAt !== undefined)         fields.due_at = body.dueAt || null   // ⚠️ ส่งดิบ ห้ามแปลง timezone
  if (body.priority !== undefined)      fields.priority = Number(body.priority) || 0
  if (!Object.keys(fields).length)      return err(400, 'ไม่มีอะไรให้แก้')

  const res = await cardDB.updateCard(orgId, card.id, fields, { lockToken: body.lockToken })
  if (res.notFound) return err(404, 'ไม่พบKANBANใบนี้')
  // 409 = คนอื่นแก้ไปแล้ว → คืนของจริงใน DB ให้ UI ถามว่าจะโหลดใหม่ไหม (ห้าม last-write-wins)
  if (res.conflict) return Response.json({ error: 'มีคนแก้KANBANใบนี้ไปแล้ว', card: res.card }, { status: 409 })
  return Response.json({ card: res.card })
}

/**
 * DELETE            → เก็บเข้ากรุ (archive · ย้อนได้ด้วย PATCH { restore: true })
 * DELETE ?purge=1   → ลบถาวร (admin เท่านั้น · ลบได้เลย ไม่ต้องเข้ากรุก่อน — ลอกแบบ posts)
 *
 * ⚠️ ค่าตั้งต้นยังเป็น "เก็บเข้ากรุ" เหมือนเดิมเป๊ะ — ห้ามสลับความหมาย
 *    commit 37dd5e6 เคยพลาดตรงนี้: ปุ่มเขียน "เก็บเข้ากรุ" แต่ลบถาวรจริง
 */
export async function DELETE(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error

  // ⛔ ของจริงเป็นเจ้าของวงจรชีวิต — ลบ/เก็บเข้ากรุที่ต้นทางเท่านั้น (ทรงเดียวกับด่านแก้ชื่อ)
  //    กันซ้ำกับ `can:` ใน GET เพราะ route นี้ยิงตรงได้ ไม่ได้ผ่าน UI เสมอ
  if (isLinkedCard(ctx.card)) {
    const kind = LINK_KIND_LABEL[ctx.card.link?.entity_type] || 'ของจริง'
    return err(400, `KANBANใบนี้ผูกกับ${kind}อยู่ — ลบหรือเก็บเข้ากรุที่หน้า${kind} แล้วการ์ดจะตามไปเอง`)
  }

  if (new URL(req.url).searchParams.get('purge') === '1') {
    if (!canPurge(ctx.access)) return err(403, 'ลบถาวรได้เฉพาะแอดมิน')
    const ok = await cardDB.deleteCard(ctx.orgId, ctx.card.id)
    if (!ok) return err(404, 'ไม่พบKANBANใบนี้')
    return Response.json({ ok: true, purged: true })
  }

  if (!canArchiveCard(ctx.card, ctx.access, ctx.userId)) return err(403, 'เก็บเข้ากรุได้เฉพาะคนที่สร้างKANBANใบนี้')
  return Response.json({ ok: await cardDB.archiveCard(ctx.orgId, ctx.card.id) })
}
