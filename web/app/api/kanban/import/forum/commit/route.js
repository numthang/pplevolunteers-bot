// /api/kanban/import/forum/commit — สร้างการ์ดจากกระทู้ที่คัดไว้
//
// POST { ids: [id, ...] } → { created, failed, cards }
//
// วันเวลาของการ์ด (user เคาะ 2026-09-04) — ⛔ ห้ามปล่อยให้เป็น now() สักช่อง:
//   created_at / updated_at / start_at = วันตั้งกระทู้   (ไม่งั้นกระทู้ปี 2023 ลอยขึ้นหัวรายการ
//                                                        "เรียงตามวันสร้าง/อัปเดตล่าสุด" เหมือนเพิ่งสร้าง
//                                                        — เคยต้องตามแก้ด้วย migration 4 ตัว)
//   due_at        = วันจัดงานที่ AI ดึงได้ (ไม่มี = ว่าง — ไม่แต่งกำหนดส่งขึ้นเอง)
//   completed_at  = วันจัดงาน ถ้าไม่มีถอยไปใช้วันตั้งกระทู้ (ช่องนี้เป็นตัวเรียงกอง "เสร็จ")
//   status_type   = done
//
// ⭐ ไม่บังคับมีผู้รับผิดชอบ — กฎนั้นถูกถอดทั้งชุด 2026-09-03 (ห้ามยัดคนปลอมซ้ำรอย backfillCaseThreads)
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { isKanbanAdmin } from '@/lib/kanbanAccess.js'
import * as importDB from '@/db/kanban/forumImport.js'
import * as cardDB from '@/db/kanban/cards.js'
import * as fieldDB from '@/db/kanban/fields.js'
import * as attDB from '@/db/kanban/attachments.js'
import { saveKanbanBuffer, isAllowedMime, MAX_FILE_SIZE, MAX_FILES_PER_CARD } from '@/lib/kanbanUploads.js'
import pool from '@/db/index.js'

const API = 'https://discord.com/api/v10'

/** รูปจากข้อความเปิดกระทู้ → uploads/kanban (ต้องโหลด bytes เอง — URL ของ Discord หมดอายุ) */
async function importImages(orgId, cardId, threadId, userId) {
  const msg = await fetch(`${API}/channels/${threadId}/messages/${threadId}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null)

  const images = (msg?.attachments || [])
    .filter((a) => isAllowedMime((a.content_type || '').split(';')[0].trim()) && a.size <= MAX_FILE_SIZE)
    .slice(0, MAX_FILES_PER_CARD)

  let n = 0
  for (const [i, att] of images.entries()) {
    try {
      const res = await fetch(att.url)
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > MAX_FILE_SIZE) continue
      const mime = (att.content_type || 'image/jpeg').split(';')[0].trim()
      const meta = await saveKanbanBuffer(cardId, buf, { mime, originalName: att.filename || null })
      // ON CONFLICT (discord_attachment_id) กันรูปซ้ำถ้ามีการนำเข้าซ้ำรอบสอง
      await attDB.insertAttachment(orgId, cardId, {
        ...meta, sort_order: i, created_by: userId,
        discord_attachment_id: String(att.id), discord_message_id: String(threadId),
      })
      n++
    } catch { /* รูปเดียวพัง ไม่ควรทำให้ทั้งการ์ดพัง */ }
  }
  return n
}

export async function POST(req) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error
  if (!isKanbanAdmin(ctx.access)) return err(403, 'หน้านี้สำหรับผู้ดูแลเท่านั้น')

  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter((s) => /^\d+$/.test(s)) : []
  if (!ids.length) return err(400, 'ยังไม่ได้เลือกกระทู้')

  // field "สายงาน"/"พื้นที่" ของ org นี้ — ค่าที่คัดไว้เป็น option id ของ 2 ช่องนี้
  const defs = await fieldDB.listFieldDefs(ctx.orgId)
  const fieldByLabel = Object.fromEntries(defs.filter((d) => ['สายงาน', 'พื้นที่'].includes(d.label))
    .map((d) => [d.label, d]))

  const created = []
  const failed = []

  for (const id of ids) {
    const row = await importDB.getImportRow(ctx.orgId, id)
    if (!row) { failed.push({ id, reason: 'ไม่พบกระทู้นี้' }); continue }
    if (row.status === 'imported') { failed.push({ id, reason: 'นำเข้าไปแล้ว' }); continue }

    const eff = importDB.effective(row)
    if (!eff.title) { failed.push({ id, reason: 'ไม่มีชื่อ' }); continue }

    try {
      const threadDate = row.thread_created_at
      const card = await cardDB.createCard(ctx.orgId, {
        title: eff.title,
        detail: eff.detail,
        assigneeIds: eff.assigneeUserId ? [eff.assigneeUserId] : [],
        startAt: threadDate,
        dueAt: eff.eventDate || null,
        statusType: 'done',
        sourceUrl: row.url,
        sourceMessageId: row.thread_id,
      }, ctx.userId)

      // ⚠️ 3 ช่องนี้ createCard ตั้งให้ไม่ได้ (default now()) — ต้องเขียนทับทันทีหลังสร้าง
      await pool.query(
        `UPDATE kanban_cards
            SET created_at = $3, updated_at = $3, completed_at = COALESCE($4::date, $3)
          WHERE org_id = $1 AND id = $2`,
        [ctx.orgId, card.id, threadDate, eff.eventDate || null]
      )

      for (const [label, value] of [['สายงาน', eff.workstreams], ['พื้นที่', eff.areas]]) {
        const def = fieldByLabel[label]
        if (!def || !value?.length) continue
        await fieldDB.setCardFieldValue(ctx.orgId, card.id, def.id, def.type, value.map(Number))
      }

      const images = await importImages(ctx.orgId, card.id, row.thread_id, ctx.userId)

      await pool.query(
        `UPDATE kanban_forum_import SET status = 'imported', card_id = $3, updated_at = CURRENT_TIMESTAMP
          WHERE org_id = $1 AND id = $2`,
        [ctx.orgId, id, card.id]
      )

      created.push({ id, cardId: String(card.id), refNo: card.ref_no, images })
    } catch (e) {
      console.error('[forumImport] commit', id, e.message)
      failed.push({ id, reason: e.message })
    }
  }

  return Response.json({ created, failed })
}
