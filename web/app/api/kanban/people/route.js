// /api/kanban/people?q=… — ค้นคนใน org ไว้เลือกเป็นผู้รับผิดชอบ
//
// ⚠️ **ค้นเท่านั้น ห้าม dump ทั้งก้อน** — org 1 มีสมาชิก active 7,376 คน
//    dropdown ที่โหลดทุกคนมาไว้ก่อนคือหน้าค้าง 7 พันแถว (ใช้ searchOrgMembers ที่ LIMIT มาให้แล้ว)
//
// ต่ำกว่า 2 ตัวอักษรคืนว่าง — กัน 'a' ตัวเดียวกวาดครึ่ง org (กติกาเดียวกับ /api/org/orgs/[id]/members)
//
// ⚠️ ใช้ searchKanbanPeople ไม่ใช่ searchOrgMembers — ต้องได้ "ชื่อชุดเดียวกับที่การ์ดโชว์"
//    (เหตุผลเต็มอยู่หัวไฟล์ db/kanban/people.js)
import { kanbanContext } from '@/lib/kanbanGuard.js'
import { searchKanbanPeople } from '@/db/kanban/people.js'

export async function GET(req) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const q = new URL(req.url).searchParams.get('q')?.trim() || ''
  if (q.length < 2) return Response.json({ people: [] })

  const rows = await searchKanbanPeople(ctx.orgId, q)
  // ส่งเฉพาะที่ UI ใช้ — ไม่ยิง email/discord_id ของคนทั้ง org ออกไปให้ทุกคนที่เปิดการ์ด
  // username = ตัวแยกคนชื่อซ้ำ (org นี้มี "Ploy" 6 คน) · ไม่ส่งถ้าซ้ำกับชื่อที่โชว์อยู่แล้ว
  return Response.json({
    people: rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      username: r.username && r.username !== r.name ? r.username : null,
    })),
  })
}
