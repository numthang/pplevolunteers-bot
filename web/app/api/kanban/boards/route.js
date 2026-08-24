// /api/kanban/boards — กระดาน (ก้อน 3)
//
// GET            → { boards: [...ที่ยังไม่เข้ากรุ] }  · อ่านได้ทุกคนใน org (กรองด้วย canViewBoard)
// GET ?archived=1 → { boards: [...เฉพาะที่อยู่ในกรุ] }
// POST { name }  → สร้างกระดานใหม่ · user เคาะ 2026-08-24: **กรอกชื่ออย่างเดียว**
//                  ที่เหลือ (ผูก guild / เชิญคน / ตั้ง field) ไปทำทีหลังที่เฟืองของกระดาน
//
// ⛔ ไม่มี admin gate ตอนสร้าง — เหตุผลเดียวกับ /api/kanban/fields: กระดานเป็นของทุกคนในองค์กร
//    กันขยะด้วย "กระดานสุดท้ายเก็บเข้ากรุไม่ได้" ไม่ใช่ด้วยการห้ามสร้าง
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { canViewBoard, canCreateBoard } from '@/lib/kanbanAccess.js'
import * as boardDB from '@/db/kanban/boards.js'

export async function GET(req) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const onlyArchived = new URL(req.url).searchParams.get('archived') === '1'
  const all = await boardDB.listBoards(ctx.orgId, { includeArchived: onlyArchived })
  const wanted = onlyArchived ? all.filter((b) => b.archived_at) : all

  // กรองด้วยด่านเดียวกับที่ใช้ตอนเปิดกระดาน — ห้ามให้ dropdown โชว์ชื่อกระดานที่กดเข้าไปแล้วโดนปฏิเสธ
  return Response.json({ boards: wanted.filter((b) => canViewBoard(b, ctx.access, ctx.userId)) })
}

export async function POST(req) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error
  if (!canCreateBoard(ctx.access, ctx.userId)) return err(403, 'ไม่มีสิทธิ์สร้างกระดาน')

  const body = await req.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  if (!name) return err(400, 'ต้องตั้งชื่อกระดาน')
  if (name.length > 100) return err(400, 'ชื่อกระดานยาวเกิน 100 ตัวอักษร')

  // guildId ส่งมาได้ตอนสร้างจากบอท (ห้องดิสฯ รู้ guild ตัวเอง) — บนเว็บไม่ส่ง = ไม่ผูกเซิร์ฟไหน
  const guildId = String(body.guildId || '').trim() || null

  const board = await boardDB.createBoard(ctx.orgId, { name, guildId }, ctx.userId)
  return Response.json({ board }, { status: 201 })
}
