// /api/kanban/cards/[id]/attachments/[attId] — เสิร์ฟไฟล์ / ลบไฟล์
//
//   GET     → bytes ของไฟล์ (gate เดียวกับการเปิดการ์ด: ต้องเห็นการ์ดใบนี้ได้)
//   DELETE  → { attachments: [...] }  (ต้องแก้การ์ดใบนี้ได้)
//
// ⚠️ ไฟล์อยู่นอก /public — ทางเดียวที่ดาวน์โหลดได้คือ route นี้ ห้ามย้ายไป static
import { cardContext, err } from '@/lib/kanbanGuard.js'
import { canEditCard } from '@/lib/kanbanAccess.js'
import { readKanbanFile, deleteKanbanFiles } from '@/lib/kanbanUploads.js'
import * as attDB from '@/db/kanban/attachments.js'

/** ไฟล์ต้องเป็นของการ์ดใบที่อยู่ใน URL จริง — ไม่งั้น id ใบไหนก็ดึงไฟล์ของใบอื่นได้ */
async function resolve(ctx, attId) {
  const att = await attDB.getAttachment(ctx.orgId, attId)
  if (!att || String(att.card_id) !== String(ctx.card.id)) return null
  return att
}

export async function GET(_req, { params }) {
  const { id, attId } = await params
  const ctx = await cardContext(id)
  if (ctx.error) return new Response('Not found', { status: 404 })

  const att = await resolve(ctx, attId)
  if (!att) return new Response('Not found', { status: 404 })

  try {
    const buf = await readKanbanFile(att.file_path)
    return new Response(buf, {
      headers: {
        'Content-Type': att.mime || 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return new Response('File not found', { status: 404 })
  }
}

export async function DELETE(_req, { params }) {
  const { id, attId } = await params
  const ctx = await cardContext(id)
  if (ctx.error) return ctx.error
  if (!canEditCard(ctx.card, ctx.access, ctx.userId)) return err(403, 'ไม่มีสิทธิ์ลบไฟล์ในKANBANใบนี้')

  const att = await resolve(ctx, attId)
  if (!att) return err(404, 'ไม่พบไฟล์นี้')

  const filePath = await attDB.deleteAttachment(ctx.orgId, att.id)
  if (filePath) await deleteKanbanFiles([filePath])   // DB คือความจริง · ดิสก์ตามทีหลัง ล้มได้ไม่พังทั้ง request

  return Response.json({ attachments: await attDB.listCardAttachments(ctx.orgId, ctx.card.id) })
}
