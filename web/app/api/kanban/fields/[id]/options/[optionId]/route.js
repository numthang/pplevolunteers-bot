// /api/kanban/fields/[id]/options/[optionId] — แก้ / ลบตัวเลือกถาวร 1 ตัว
//
// PATCH  { name?, color? }   → { option }
// PATCH  { archived: bool }  → { option }   ซ่อน / เอากลับ (ส่งมาเดี่ยวๆ ไม่ปนกับ name/color)
// GET    ?impact=1          → { impact }   นับว่าใช้อยู่กี่การ์ด (เติมตัวเลขในกล่องยืนยัน)
// DELETE                    → { ok }       **ลบถาวรจริง** ไม่มี gate ยศ
//
// ⚠️ **ประวัติ 2 รอบ อ่านก่อนแก้:**
//    2026-08-18 ถอด archive ทิ้ง เพราะ cards.js มี `AND o.archived_at IS NULL` ใน JOIN
//      → ซ่อนก็ทำให้ชิปหายจากทุกการ์ดทันที = ไม่ต่างจากลบ แถมไม่มีทางเอากลับ
//    2026-08-19 ค่ำ เอากลับมาใหม่ **หลังแก้ต้นเหตุแล้ว** — เงื่อนไขใน cards.js ถูกถอดออก
//      ซ่อน = หายจากรายการให้เลือก · การ์ดที่ติดไว้แล้วยังเห็นเหมือนเดิม · กด "เอากลับ" ได้
//      ⛔ ถ้าใครใส่ `o.archived_at IS NULL` กลับเข้า cards.js เมื่อไหร่ ฟีเจอร์นี้ตายอีกรอบทันที
// ⛔ ห้ามใส่ canPurge ที่นี่ — ลบตัวเลือกเป็นงานประจำวัน คุมแล้ว flow "พิมพ์ชื่อใหม่ = สร้างตัวเลือก" พังทันที
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { LABEL_PALETTE } from '@/lib/kanbanLabelColors.js'
import * as fieldDB from '@/db/kanban/fields.js'

export async function PATCH(req, { params }) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const { id, optionId } = await params
  const fieldId = String(id || '').trim()
  const optId = String(optionId || '').trim()
  if (!/^\d+$/.test(fieldId) || !/^\d+$/.test(optId)) return err(404, 'ไม่พบตัวเลือกนี้')

  const field = await fieldDB.getFieldDef(ctx.orgId, fieldId)
  if (!field) return err(404, 'ไม่พบช่องข้อมูลนี้')

  const body = await req.json().catch(() => ({}))

  // ซ่อน / เอากลับ — คนละเส้นกับแก้ชื่อ/สี ส่งมาเดี่ยวๆ เสมอ
  if (body.archived !== undefined) {
    const option = await fieldDB.setFieldOptionArchived(field.id, optId, Boolean(body.archived))
    return option ? Response.json({ option }) : err(404, 'ไม่พบตัวเลือกนี้')
  }

  const patch = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return err(400, 'ต้องมีชื่อตัวเลือก')
    if (name.length > 60) return err(400, 'ชื่อตัวเลือกยาวเกิน 60 ตัวอักษร')
    patch.name = name
  }
  if (body.color !== undefined) {
    const color = body.color || null
    if (color && !LABEL_PALETTE.includes(color)) return err(400, 'สีนี้ไม่อยู่ในคลังสี')
    patch.color = color
  }
  if (!Object.keys(patch).length) return err(400, 'ไม่มีอะไรให้แก้')

  const res = await fieldDB.updateFieldOption(field.id, optId, patch)
  if (res.notFound)  return err(404, 'ไม่พบตัวเลือกนี้')
  if (res.duplicate) return err(409, 'มีตัวเลือกชื่อนี้อยู่แล้ว')
  return Response.json({ option: res.option })
}

export async function GET(req, { params }) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const { id, optionId } = await params
  const fieldId = String(id || '').trim()
  const optId = String(optionId || '').trim()
  if (!/^\d+$/.test(fieldId) || !/^\d+$/.test(optId)) return err(404, 'ไม่พบตัวเลือกนี้')
  if (new URL(req.url).searchParams.get('impact') !== '1') return err(400, 'ต้องระบุ impact=1')

  const field = await fieldDB.getFieldDef(ctx.orgId, fieldId)
  if (!field) return err(404, 'ไม่พบช่องข้อมูลนี้')

  return Response.json({ impact: await fieldDB.countOptionUsage(field.id, optId) })
}

/** ลบตัวเลือกถาวร — ใครแก้การ์ดได้ก็ลบได้ (ไม่มี gate ยศ · ดูหัวไฟล์) */
export async function DELETE(_req, { params }) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const { id, optionId } = await params
  const fieldId = String(id || '').trim()
  const optId = String(optionId || '').trim()
  if (!/^\d+$/.test(fieldId) || !/^\d+$/.test(optId)) return err(404, 'ไม่พบตัวเลือกนี้')

  const field = await fieldDB.getFieldDef(ctx.orgId, fieldId)
  if (!field) return err(404, 'ไม่พบช่องข้อมูลนี้')

  const ok = await fieldDB.deleteFieldOption(field.id, optId)
  if (!ok) return err(404, 'ไม่พบตัวเลือกนี้')
  return Response.json({ ok: true })
}
