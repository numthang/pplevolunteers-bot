// /api/kanban/cards/[id]/labels — ติด/ถอดป้ายของการ์ด 1 ใบ
//
// PUT { labelIds: [1,2,3] } → แทนที่ป้ายทั้งชุด · [] = ถอดหมด
//
// ทำไมเป็น PUT ทั้งชุด ไม่ใช่ POST/DELETE ทีละใบ:
//   กล่องเลือกป้ายเป็น "ติ๊กหลายช่องแล้วได้ชุดใหม่" → ส่งชุดเดียวจบ กัน state ฝั่ง client เพี้ยน
//   ถ้าติ๊ก 3 ครั้งเร็วๆ แล้วยิง 3 request คนละใบ ลำดับตอบกลับสลับได้ → UI โชว์ผิด
//
// ⚠️ ไม่ผ่าน lockToken เหมือน PATCH เนื้อหา — ป้ายเป็น action ปุ่มเดียว ไม่ใช่ autosave ช่องพิมพ์
//    (แนวเดียวกับ statusType / helpers ที่ทำไว้แล้ว)
import { cardContext, err } from '@/lib/kanbanGuard.js'
import { canEditCard } from '@/lib/kanbanAccess.js'
import * as cardDB from '@/db/kanban/cards.js'
import * as labelDB from '@/db/kanban/labels.js'

export async function PUT(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error

  if (!canEditCard(ctx.card, ctx.access, ctx.userId)) {
    return err(403, 'ไม่มีสิทธิ์แก้ป้ายของการบ้านใบนี้')
  }

  const body = await req.json().catch(() => ({}))
  if (!Array.isArray(body.labelIds)) return err(400, 'labelIds ต้องเป็นรายการ')

  // ⚠️ id เป็น BIGINT → pg คืนมาเป็นสตริง · ส่งเข้า ANY($3::bigint[]) เป็นสตริงได้ แต่ต้องเป็นตัวเลขล้วน
  //    กรองขยะทิ้งที่นี่ ไม่ปล่อยให้ pg โยน 22P02 แล้วกลายเป็น 500
  const labelIds = body.labelIds.map((x) => String(x).trim()).filter((x) => /^\d+$/.test(x))

  const ok = await labelDB.setCardLabels(ctx.orgId, ctx.card.id, labelIds)
  if (!ok) return err(404, 'ไม่พบการบ้านใบนี้')

  return Response.json({ card: await cardDB.getCard(ctx.orgId, ctx.card.id) })
}
