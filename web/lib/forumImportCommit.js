// web/lib/forumImportCommit.js — สร้างการ์ด KANBAN จากกระทู้ที่คัดไว้ในตารางพัก
//
// แยกจาก route เพื่อให้สโมคเรียกตรงได้โดยไม่ต้องมี session (ตรรกะเดียวกันเป๊ะ ไม่ใช่สำเนา)
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

/**
 * สร้างการ์ดจากแถวในตารางพัก
 * @returns {Promise<{created: object[], failed: object[]}>}
 */
export async function commitImportRows(orgId, ids, userId) {
  // field "สายงาน"/"พื้นที่" ของ org นี้ — ค่าที่คัดไว้เป็น option id ของ 2 ช่องนี้
  const defs = await fieldDB.listFieldDefs(orgId)
  const fieldByLabel = Object.fromEntries(defs.filter((d) => ['สายงาน', 'พื้นที่'].includes(d.label))
    .map((d) => [d.label, d]))

  const created = []
  const failed = []

  for (const id of ids) {
    const row = await importDB.getImportRow(orgId, id)
    if (!row) { failed.push({ id, reason: 'ไม่พบกระทู้นี้' }); continue }
    if (row.status === 'imported') { failed.push({ id, reason: 'นำเข้าไปแล้ว' }); continue }

    const eff = importDB.effective(row)
    if (!eff.title) { failed.push({ id, reason: 'ไม่มีชื่อ' }); continue }

    try {
      const threadDate = row.thread_created_at
      const card = await cardDB.createCard(orgId, {
        title: eff.title,
        detail: eff.detail,
        assigneeIds: eff.assigneeUserId ? [eff.assigneeUserId] : [],
        startAt: threadDate,
        dueAt: eff.eventDate || null,
        statusType: 'done',
        sourceUrl: row.url,
        sourceMessageId: row.thread_id,
      }, userId)

      // ⚠️ 3 ช่องนี้ createCard ตั้งให้ไม่ได้ (default now()) — ต้องเขียนทับทันทีหลังสร้าง
      await pool.query(
        // ⚠️ cast ให้ครบทุกตัว — $3 ถูกใช้ทั้งเดี่ยวๆ และใน COALESCE คู่กับ date
        //    ไม่ cast = "inconsistent types deduced for parameter $3" (เจอตอนสโมค 2026-09-04)
        `UPDATE kanban_cards
            SET created_at = $3::timestamptz,
                updated_at = $3::timestamptz,
                completed_at = COALESCE($4::date::timestamptz, $3::timestamptz)
          WHERE org_id = $1 AND id = $2`,
        [orgId, card.id, threadDate, eff.eventDate || null]
      )

      for (const [label, value] of [['สายงาน', eff.workstreams], ['พื้นที่', eff.areas]]) {
        const def = fieldByLabel[label]
        if (!def || !value?.length) continue
        await fieldDB.setCardFieldValue(orgId, card.id, def.id, def.type, value.map(Number))
      }

      const images = await importImages(orgId, card.id, row.thread_id, userId)

      await pool.query(
        `UPDATE kanban_forum_import SET status = 'imported', card_id = $3, updated_at = CURRENT_TIMESTAMP
          WHERE org_id = $1 AND id = $2`,
        [orgId, id, card.id]
      )

      created.push({ id, cardId: String(card.id), refNo: card.ref_no, images })
    } catch (e) {
      console.error('[forumImport] commit', id, e.message)
      failed.push({ id, reason: e.message })
    }
  }

  return { created, failed }
}
