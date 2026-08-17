// /api/kanban/labels/[id] — แก้ป้าย 1 ใบ (หน้าจัดการป้าย)
//
// PATCH { name?, groupName?, color?, archived? } → { label }
//
// ⛔ admin เท่านั้น — เปลี่ยนชื่อ/ซ่อนป้ายกระทบทุกการ์ดของทุกคนพร้อมกัน
//    (สร้างป้ายใหม่เปิดให้ทุกคน อยู่ที่ ../route.js)
// ⚠️ ไม่มีทางลบป้ายถาวร — ซ่อนอย่างเดียว ป้ายที่ติดการ์ดอยู่ห้ามหายเงียบ
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { isKanbanAdmin } from '@/lib/kanbanAccess.js'
import { LABEL_PALETTE } from '@/lib/kanbanLabelColors.js'
import * as labelDB from '@/db/kanban/labels.js'

export async function PATCH(req, { params }) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error
  if (!isKanbanAdmin(ctx.access)) return err(403, 'ต้องเป็นแอดมินถึงจะจัดการคลังป้ายได้')

  // ⚠️ id เป็น BIGINT → มาเป็นสตริง ห้ามแปลงเป็น Number (บทเรียนเดียวกับ bigint id ของ posts)
  const { id } = await params
  const labelId = String(id || '').trim()
  if (!/^\d+$/.test(labelId)) return err(404, 'ไม่พบป้ายนี้')

  const body = await req.json().catch(() => ({}))

  // ซ่อน/เลิกซ่อน เป็น action เดี่ยว ไม่ปนกับการแก้ชื่อ
  if (body.archived !== undefined) {
    const ok = body.archived
      ? await labelDB.archiveLabel(ctx.orgId, labelId)
      : await labelDB.unarchiveLabel(ctx.orgId, labelId)
    if (!ok) return err(404, 'ไม่พบป้ายนี้ หรือสถานะเป็นแบบนั้นอยู่แล้ว')
    return Response.json({ ok: true })
  }

  const patch = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return err(400, 'ต้องมีชื่อป้าย')
    if (name.length > 60) return err(400, 'ชื่อป้ายยาวเกิน 60 ตัวอักษร')
    patch.name = name
  }
  if (body.groupName !== undefined) {
    const groupName = String(body.groupName || '').trim() || null
    if (groupName) {
      if (groupName.length > 60) return err(400, 'ชื่อกลุ่มยาวเกิน 60 ตัวอักษร')
      // admin ตั้งกลุ่มใหม่ได้ (ต่างจากคนทั่วไปที่ POST สร้างได้เฉพาะในกลุ่มเดิม)
    }
    patch.groupName = groupName
  }
  if (body.color !== undefined) {
    const color = body.color || null
    // รับเฉพาะสีในคลังพาสเทลของ user — ห้ามให้พิมพ์ hex เองแล้วได้เฉดนอกชุด
    if (color && !LABEL_PALETTE.includes(color)) return err(400, 'สีนี้ไม่อยู่ในคลังสี')
    patch.color = color
  }
  if (!Object.keys(patch).length) return err(400, 'ไม่มีอะไรให้แก้')

  const res = await labelDB.updateLabel(ctx.orgId, labelId, patch)
  if (res.notFound)  return err(404, 'ไม่พบป้ายนี้')
  if (res.duplicate) return err(409, 'มีป้ายชื่อนี้ในกลุ่มนี้อยู่แล้ว')
  return Response.json({ label: res.label })
}
