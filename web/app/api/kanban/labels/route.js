// /api/kanban/labels — คลังป้ายของ org (จัดกลุ่มมาให้แล้ว)
//
// GET → { groups: [{ group, labels: [{ id, group_name, name, color, sort_order }] }] }
//
// อ่านได้ทุกคนใน org — ป้ายเป็นคำศัพท์กลางขององค์กร ไม่ใช่ข้อมูลของการ์ดใบไหน
// (การ์ดใครแก้ได้บ้างไปตัดสินที่ route ของการ์ด ไม่ใช่ที่นี่)
import { kanbanContext } from '@/lib/kanbanGuard.js'
import * as labelDB from '@/db/kanban/labels.js'

export async function GET() {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  return Response.json({ groups: await labelDB.listLabelGroups(ctx.orgId) })
}
