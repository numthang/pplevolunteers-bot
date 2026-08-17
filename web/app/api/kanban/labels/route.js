// /api/kanban/labels — คลังป้ายของ org (จัดกลุ่มมาให้แล้ว)
//
// GET              → { groups: [{ group, labels: [{ id, group_name, name, color, sort_order }] }] }
// GET ?view=manage → { labels: [...รวมที่ซ่อนไว้ + card_count] , groupNames: [...] }  · admin เท่านั้น
// POST             → สร้างป้ายใหม่ (จากในกล่องเลือกป้ายของการ์ด)
//
// อ่านได้ทุกคนใน org — ป้ายเป็นคำศัพท์กลางขององค์กร ไม่ใช่ข้อมูลของการ์ดใบไหน
// (การ์ดใครแก้ได้บ้างไปตัดสินที่ route ของการ์ด ไม่ใช่ที่นี่)
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { isKanbanAdmin } from '@/lib/kanbanAccess.js'
import * as labelDB from '@/db/kanban/labels.js'

export async function GET(req) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  if (new URL(req.url).searchParams.get('view') === 'manage') {
    // เปลี่ยนชื่อ/ซ่อนป้าย = กระทบทุกคนที่เห็นการ์ด → admin เท่านั้น (สร้างป้ายใหม่ยังเปิดให้ทุกคน)
    if (!isKanbanAdmin(ctx.access)) return err(403, 'ต้องเป็นแอดมินถึงจะจัดการคลังป้ายได้')
    const [labels, groupNames] = await Promise.all([
      labelDB.listLabelsWithCounts(ctx.orgId),
      labelDB.listGroupNames(ctx.orgId),
    ])
    return Response.json({ labels, groupNames })
  }

  // canManage ติดมาด้วยเลย — กล่องเลือกป้ายจะได้โชว์ทางเข้าหน้าจัดการเฉพาะ admin
  // โดยไม่ต้องยิง /api/me/access เพิ่มอีกรอบแค่เพื่อตัดสินว่าจะวาดลิงก์ไหม
  return Response.json({
    groups: await labelDB.listLabelGroups(ctx.orgId),
    canManage: isKanbanAdmin(ctx.access),
  })
}

/**
 * สร้างป้ายใหม่ — ทุกคนใน org สร้างได้ (ป้ายเป็นคำศัพท์กลาง อาสาต้องติดป้ายงานตัวเองได้)
 *
 * ⛔ แต่ **ตั้งกลุ่มใหม่ไม่ได้** — กลุ่มต้องเป็นกลุ่มที่ org มีอยู่แล้ว หรือไม่มีกลุ่มเลย
 *    org 1 มีสมาชิก 7,376 คน · ป้ายลบไม่ได้ (ซ่อนได้อย่างเดียวและเป็นสิทธิ์ admin)
 *    ถ้าปล่อยให้ตั้งกลุ่มเองด้วย คลังป้ายจะเละแบบที่ admin ตามเก็บไม่ไหว
 */
export async function POST(req) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const body = await req.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  if (!name) return err(400, 'ต้องมีชื่อป้าย')
  if (name.length > 60) return err(400, 'ชื่อป้ายยาวเกิน 60 ตัวอักษร')   // คอลัมน์เป็น VARCHAR(60)

  const groupName = String(body.groupName || '').trim() || null
  if (groupName) {
    const groups = await labelDB.listGroupNames(ctx.orgId)
    if (!groups.includes(groupName)) return err(400, 'ไม่มีกลุ่มป้ายชื่อนี้')
  }

  // ensureLabel คืนป้ายเดิมถ้าชื่อซ้ำในกลุ่มเดียวกัน — ปลายทางที่ผู้ใช้ต้องการเหมือนกัน ไม่ต้องเป็น error
  const label = await labelDB.ensureLabel(ctx.orgId, { name, groupName })
  if (!label) return err(400, 'สร้างป้ายไม่สำเร็จ')
  return Response.json({ label }, { status: 201 })
}
