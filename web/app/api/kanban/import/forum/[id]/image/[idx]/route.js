// /api/kanban/import/forum/[id]/image/[idx] — รูปในข้อความเปิดกระทู้ (ดูตอนคัด)
//
// ⭐ ดึงสดจาก Discord ทุกครั้ง **ตั้งใจไม่เก็บไฟล์** — 256 กระทู้ × 4 รูปเป็นหลาย GB
//    ทั้งที่ส่วนใหญ่จะถูกกด "ไม่เอา" · โหลดเก็บจริงตอนกดนำเข้าเท่านั้น (ลง kanban_card_attachments)
// ⚠️ ห้ามส่ง URL ของ Discord กลับไปให้เบราว์เซอร์โหลดเอง — URL มี signature หมดอายุ 24 ชม.
//    และการให้เบราว์เซอร์ยิงตรงเท่ากับเปิดเผย CDN path ของเซิร์ฟเวอร์ที่ล็อกสิทธิ์ไว้
import { kanbanContext } from '@/lib/kanbanGuard.js'
import { isKanbanAdmin } from '@/lib/kanbanAccess.js'
import * as importDB from '@/db/kanban/forumImport.js'
import { fetchThreadImages } from '@/lib/forumThreadImages.js'

const MAX_INDEX = 3   // ดูได้ 4 รูปแรกเท่ากับที่จะนำเข้าจริง

export async function GET(_req, { params }) {
  const ctx = await kanbanContext()
  if (ctx.error) return new Response('Unauthorized', { status: 401 })
  if (!isKanbanAdmin(ctx.access)) return new Response('Forbidden', { status: 403 })

  const { id, idx } = await params
  const n = Number(idx)
  if (!Number.isInteger(n) || n < 0 || n > MAX_INDEX) return new Response('Not found', { status: 404 })

  const row = await importDB.getImportRow(ctx.orgId, id)
  if (!row) return new Response('Not found', { status: 404 })

  // ⚠️ ต้องใช้ลำดับเดียวกับตอนนำเข้าจริง (ทั้งเธรด เรียงเก่า→ใหม่) ไม่งั้นรูปที่เห็นตอนคัด
  //    กับรูปที่ติดไปกับการ์ดจะคนละใบกัน
  const images = await fetchThreadImages(row.thread_id, MAX_INDEX + 1)
  const att = images[n]
  if (!att) return new Response('Not found', { status: 404 })

  const file = await fetch(att.url).catch(() => null)
  if (!file?.ok) return new Response('File not found', { status: 404 })

  return new Response(file.body, {
    headers: {
      'Content-Type': att.content_type || 'image/jpeg',
      'Cache-Control': 'private, max-age=600',
    },
  })
}
