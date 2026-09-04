// /api/kanban/cards/[id]/attachments — ไฟล์แนบของการ์ด (รายการ + อัปโหลด)
//
//   GET   → { attachments: [...] }
//   POST  multipart/form-data (field ชื่อ `files`) → { attachments: [...] }
//
// ⚠️ ไม่แตะ kanban_cards.updated_at — เขียนคนละตาราง จึงไม่ชน lock token ของ autosave เนื้อหา
// ⚠️ ไฟล์เก็บนอก /public เสมอ (uploads/kanban) — ดาวน์โหลดได้ทางเดียวคือ route [attId] ที่เช็คสิทธิ์
import { cardContext, err } from '@/lib/kanbanGuard.js'
import { canEditCard } from '@/lib/kanbanAccess.js'
import { saveKanbanFile, isAllowedMime, MAX_FILE_SIZE, MAX_FILES_PER_CARD } from '@/lib/kanbanUploads.js'
import * as attDB from '@/db/kanban/attachments.js'

export async function GET(_req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error
  return Response.json({ attachments: await attDB.listCardAttachments(ctx.orgId, ctx.card.id) })
}

export async function POST(req, { params }) {
  const ctx = await cardContext((await params).id)
  if (ctx.error) return ctx.error
  if (!canEditCard(ctx.card, ctx.access, ctx.userId)) return err(403, 'ไม่มีสิทธิ์แนบไฟล์ในKANBANใบนี้')

  const form = await req.formData().catch(() => null)
  if (!form) return err(400, 'ต้องส่งไฟล์มาแบบ multipart/form-data')

  const files = form.getAll('files').filter((f) => typeof f === 'object' && f && 'arrayBuffer' in f)
  if (!files.length) return err(400, 'ไม่พบไฟล์')

  // เพดานนับจากของที่มีอยู่แล้ว ไม่ใช่นับเฉพาะรอบนี้ — ไม่งั้นอัปทีละ 4 ซ้ำๆ ทะลุเพดานได้
  const already = await attDB.countCardAttachments(ctx.orgId, ctx.card.id)
  if (already + files.length > MAX_FILES_PER_CARD) {
    return err(400, `แนบได้สูงสุด ${MAX_FILES_PER_CARD} ไฟล์ต่อใบ (ตอนนี้มี ${already} ไฟล์)`)
  }

  for (const f of files) {
    if (!isAllowedMime(f.type)) return err(400, `ชนิดไฟล์ไม่รองรับ: ${f.type || 'ไม่ทราบชนิด'}`)
    if (f.size > MAX_FILE_SIZE) return err(400, `ไฟล์ใหญ่เกิน 10MB: ${f.name}`)
  }

  let order = already
  for (const f of files) {
    const meta = await saveKanbanFile(ctx.card.id, f)
    await attDB.insertAttachment(ctx.orgId, ctx.card.id, {
      ...meta, sort_order: order++, created_by: ctx.userId,
    })
  }

  return Response.json({ attachments: await attDB.listCardAttachments(ctx.orgId, ctx.card.id) })
}
