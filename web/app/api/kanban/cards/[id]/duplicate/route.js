// /api/kanban/cards/[id]/duplicate — ทำสำเนาการ์ด (ใช้แทน "ชุดตั้งต้น" ของเช็คลิสต์)
//
// POST → { card, ref }
//
// ด่าน = canViewCard — เห็นการ์ดได้ก็ก๊อปได้ ไม่ต้องเป็นเจ้าภาพ
// (สำเนาเป็นการ์ดใบใหม่ของคนกด ไม่ได้ไปแตะต้นฉบับเลย จึงไม่ต้องใช้ด่าน edit)
import { cardContext, err } from '@/lib/kanbanGuard.js'
import { canViewCard, formatRef } from '@/lib/kanbanAccess.js'
import * as cardDB from '@/db/kanban/cards.js'

export async function POST(_req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error
  if (!canViewCard(ctx.card, ctx.access, ctx.userId)) return err(403, 'ไม่มีสิทธิ์ดูKANBANใบนี้')

  // ⚠️ debug mode ("View as role") ทำให้ userId เป็น null → created_by ต้องมีค่าจริงเสมอ
  if (!ctx.userId) return err(403, 'โหมดดูในนามยศอื่นทำสำเนาไม่ได้')

  const card = await cardDB.duplicateCard(ctx.orgId, ctx.card.id, ctx.userId)
  if (!card) return err(404, 'ไม่พบKANBANใบนี้')

  return Response.json({ card, ref: formatRef(card.ref_no) }, { status: 201 })
}
