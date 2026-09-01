// /api/kanban/cards/[id]/checklist — item ของเช็คลิสต์ (custom field ชนิด checklist)
//
// ผูกกับ field_id เสมอ — การ์ดเดียวมีได้หลายเช็คลิสต์ถ้า org สร้างหลาย field ชนิดนี้ (2026-08-18 รอบเย็น)
//
// GET   ?fieldId=X                → { items }
// POST  { fieldId, text }         → { item }   พิมพ์ชื่อใหม่ = สร้างตัวเลือกในคลังให้เลย (เหมือน multi_select)
// POST  { fieldId, optionId }     → { item }   หยิบจากคลังที่มีอยู่แล้ว
// PATCH { itemId, done }          → { item }        ติ๊ก/เลิกติ๊ก
// PATCH { itemId, fieldId, text }  → { item }        แก้ข้อความงานย่อย = **rename ตัวเลือกในคลัง**
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
  if (!canEditCard(ctx.card, ctx.access, ctx.userId)) return err(403, 'ไม่มีสิทธิ์แก้KANBANใบนี้')

  const body = await req.json().catch(() => ({}))
  if (!body.fieldId) return err(400, 'ต้องระบุ fieldId')

  // หยิบจากคลัง — ตรวจว่า option นั้นเป็นของ field นี้จริง (กันส่ง id ข้าม field/ข้าม org)
  if (body.optionId) {
    const field = await fieldDB.getFieldDef(ctx.orgId, body.fieldId)
    if (!field) return err(404, 'ไม่พบช่องข้อมูลนี้')
    const opts = await fieldDB.listFieldOptions(field.id)
    if (!opts.some((o) => String(o.id) === String(body.optionId))) return err(400, 'ไม่พบตัวเลือกนี้ในช่องข้อมูลนี้')

    const item = await fieldDB.addChecklistItem(ctx.orgId, ctx.card.id, field.id, { optionId: body.optionId })
    if (!item) return err(404, 'ไม่พบKANBANใบนี้')
    return Response.json({ item }, { status: 201 })
  }

  const text = String(body.text || '').trim()
  if (!text) return err(400, 'ต้องมีข้อความ')
  // 60 = ความยาวสูงสุดของชื่อตัวเลือกในคลัง (kanban_field_options.name) — ยาวกว่านี้ลงคลังไม่ได้
  if (text.length > 60) return err(400, 'ชื่อรายการยาวเกิน 60 ตัวอักษร')

  // พิมพ์ชื่อใหม่ = ลงคลังให้เลย เหมือน multi_select (user เคาะ: "ต้องมีให้บันทึก option ด้วย")
  // ensureFieldOption หาของเดิมก่อนเสมอ → พิมพ์ชื่อซ้ำไม่ได้สร้างตัวเลือกซ้ำ
  const field = await fieldDB.getFieldDef(ctx.orgId, body.fieldId)
  if (!field) return err(404, 'ไม่พบช่องข้อมูลนี้')
  const option = await fieldDB.ensureFieldOption(field.id, text)

  const item = await fieldDB.addChecklistItem(ctx.orgId, ctx.card.id, field.id,
    option ? { optionId: option.id } : { text })
  if (!item) return err(404, 'ไม่พบKANBANใบนี้')
  return Response.json({ item }, { status: 201 })
}

export async function PATCH(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error
  if (!canEditCard(ctx.card, ctx.access, ctx.userId)) return err(403, 'ไม่มีสิทธิ์แก้KANBANใบนี้')

  const body = await req.json().catch(() => ({}))

  // ลากจัดลำดับใหม่
  if (Array.isArray(body.reorder)) {
    if (!body.fieldId) return err(400, 'ต้องระบุ fieldId')
    const orderedIds = body.reorder.map((x) => String(x).trim()).filter((x) => /^\d+$/.test(x))
    const ok = await fieldDB.reorderChecklistItems(ctx.orgId, ctx.card.id, body.fieldId, orderedIds)
    if (!ok) return err(404, 'ไม่พบKANBANใบนี้')
    return Response.json({ ok: true })
  }

  /*
   * แก้ข้อความงานย่อย = **rename ตัวเลือกในคลัง → ทุกการ์ดที่ใช้ตามไปด้วย**
   * (user เคาะ 2026-08-19 ค่ำ: "เอาเหมือน select เลย พฤติกรรม")
   *
   * ⛔ **กลับคำจากเช้าวันเดียวกัน** — ของเดิมคือ ensureFieldOption(ชื่อใหม่) แล้วชี้ item ไปตัวใหม่
   *    เพื่อให้ "แก้เฉพาะการ์ดใบนี้" · ผลคือคลังงอกตัวใหม่ทุกครั้งที่แก้ และตัวเก่ากลายเป็นขยะกำพร้า
   *    user จับได้: "เวลาแก้ไขมันควรจะเป็นการแก้ไขตัวนั้น ไม่ใช่การ insert ใหม่"
   *    → ห้ามเอา ensureFieldOption กลับมาที่สาขานี้ · อยากได้ค่าต่างในใบเดียว = ถอดออกแล้วเพิ่มตัวใหม่
   *
   * แถวที่ยังไม่ผูกคลัง (option_id IS NULL — ของเก่าก่อนมีคลัง) เขียนลง text ตรงๆ ไม่ต้องลากเข้าคลัง
   */
  if (body.itemId && body.text !== undefined) {
    if (!body.fieldId) return err(400, 'ต้องระบุ fieldId')
    const text = String(body.text || '').trim()
    if (!text) return err(400, 'ต้องมีข้อความ')
    if (text.length > 60) return err(400, 'ชื่อรายการยาวเกิน 60 ตัวอักษร')

    const field = await fieldDB.getFieldDef(ctx.orgId, body.fieldId)
    if (!field) return err(404, 'ไม่พบช่องข้อมูลนี้')

    const cur = await fieldDB.getChecklistItem(ctx.orgId, body.itemId, field.id)
    if (!cur) return err(404, 'ไม่พบงานย่อยนี้')

    if (!cur.option_id) {
      const item = await fieldDB.setChecklistItemText(ctx.orgId, body.itemId, field.id, text)
      return item ? Response.json({ item }) : err(404, 'ไม่พบงานย่อยนี้')
    }

    const res = await fieldDB.updateFieldOption(field.id, cur.option_id, { name: text })
    if (res.notFound)  return err(404, 'ไม่พบตัวเลือกนี้')
    if (res.duplicate) return err(409, 'มีตัวเลือกชื่อนี้อยู่แล้ว')
    return Response.json({ item: await fieldDB.getChecklistItem(ctx.orgId, body.itemId, field.id) })
  }

  // ติ๊ก/เลิกติ๊ก
  if (!body.itemId) return err(400, 'ต้องระบุงานย่อย')
  const item = await fieldDB.setChecklistItemDone(ctx.orgId, body.itemId, Boolean(body.done))
  return item ? Response.json({ item }) : err(404, 'ไม่พบงานย่อยนี้')
}

export async function DELETE(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error
  if (!canEditCard(ctx.card, ctx.access, ctx.userId)) return err(403, 'ไม่มีสิทธิ์แก้KANBANใบนี้')

  const itemId = new URL(req.url).searchParams.get('itemId')
  if (!itemId) return err(400, 'ต้องระบุงานย่อย')
  return Response.json({ ok: await fieldDB.deleteChecklistItem(ctx.orgId, itemId) })
}
