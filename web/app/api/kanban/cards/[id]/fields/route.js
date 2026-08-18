// /api/kanban/cards/[id]/fields — เขียนค่า custom field ของการ์ด 1 ใบ
//
// PATCH { fieldId, value } → { card }
//
// ทีละฟิลด์ ไม่ใช่ทั้งชุดเหมือนป้าย — แต่ละช่องในกล่อง "ข้อมูลของทีม" เซฟทันทีตอนออกจากช่อง/เลือกค่า
// (เหมือนธงติดปัญหา/สถานะ ไม่ใช่ autosave แบบ title/detail ที่ต้องมี lockToken)
//
// ⚠️ ไม่แตะ kanban_cards.updated_at — เขียนแค่ kanban_card_field_values → ไม่กระทบ lock token ของ autosave เนื้อหา
import { cardContext, err } from '@/lib/kanbanGuard.js'
import { canEditCard } from '@/lib/kanbanAccess.js'
import { validateFieldValue } from '@/lib/kanbanFieldValue.js'
import * as cardDB from '@/db/kanban/cards.js'
import * as fieldDB from '@/db/kanban/fields.js'

export async function PATCH(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error

  if (!canEditCard(ctx.card, ctx.access, ctx.userId)) {
    return err(403, 'ไม่มีสิทธิ์แก้ข้อมูลของการบ้านใบนี้')
  }

  const body = await req.json().catch(() => ({}))
  const fieldId = String(body.fieldId || '').trim()
  if (!/^\d+$/.test(fieldId)) return err(400, 'ต้องระบุช่องข้อมูล')

  // ต้องรู้ type จริงจาก DB เสมอ — ห้ามเชื่อ type ที่ client ส่งมา (client อาจส่งชนิดผิดมาโดยตั้งใจหรือไม่ก็ตาม)
  const def = await fieldDB.getFieldDef(ctx.orgId, fieldId)
  if (!def) return err(404, 'ไม่พบช่องข้อมูลนี้')

  const check = validateFieldValue(def.type, body.value)
  if (!check.ok) return err(400, check.error)

  const res = await fieldDB.setCardFieldValue(ctx.orgId, ctx.card.id, def.id, def.type, check.value)
  if (res.notFound) return err(404, 'ไม่พบการบ้านใบนี้')

  return Response.json({ card: await cardDB.getCard(ctx.orgId, ctx.card.id) })
}
