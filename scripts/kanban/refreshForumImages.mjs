// ตามเก็บรูปจากกระทู้ให้ครบ — ทั้งนับใหม่ในตารางพัก และเติมรูปที่ขาดให้การ์ดที่นำเข้าไปแล้ว
//
//   node scripts/kanban/refreshForumImages.mjs --org 1 [--only-imported] [--dry]
//
// ทำไมต้องมี: รอบแรกดึงรูปจาก **ข้อความเปิดกระทู้อย่างเดียว** (user ทัก 2026-09-05 หลังนำเข้าไป 12 ใบ)
//   งานจริงมักโพสต์ภาพหน้างานเป็นคอมเมนต์ตามหลัง → การ์ดที่นำเข้าไปแล้วจึงได้รูปไม่ครบ
//
// ⭐ รันซ้ำได้ปลอดภัย — รูปที่มีอยู่แล้วถูกข้ามด้วย UNIQUE (discord_attachment_id)
//    และเติมได้ไม่เกิน 4 รูปต่อการ์ดเสมอ (นับรวมของเดิมที่มีอยู่)
import '../smoke/_envload.mjs'
import pool from '../../web/db/index.js'
import { fetchThreadImages } from '../../web/lib/forumThreadImages.js'
import * as attDB from '../../web/db/kanban/attachments.js'
import { saveKanbanBuffer, isAllowedMime, MAX_FILE_SIZE, MAX_FILES_PER_CARD } from '../../web/lib/kanbanUploads.js'

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1] }
const has = (n) => process.argv.includes(`--${n}`)

const orgId = Number(arg('org', 1))
const onlyImported = has('only-imported')
const dry = has('dry')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const { rows } = await pool.query(
  `SELECT id, thread_id, title, status, card_id, image_count FROM kanban_forum_import
    WHERE org_id = $1 ${onlyImported ? "AND status = 'imported'" : ''}
    ORDER BY status = 'imported' DESC, id`, [orgId]
)
console.log(`${rows.length} กระทู้${dry ? '  [DRY RUN]' : ''}`)

let recounted = 0, added = 0, failed = 0
for (const [i, row] of rows.entries()) {
  process.stdout.write(`\r  ${i + 1}/${rows.length} · นับใหม่ ${recounted} · เติมรูป ${added} · พลาด ${failed}   `)
  try {
    const images = (await fetchThreadImages(row.thread_id, MAX_FILES_PER_CARD))
      .filter((a) => isAllowedMime((a.content_type || '').split(';')[0].trim()) && a.size <= MAX_FILE_SIZE)

    if (images.length !== row.image_count) {
      if (!dry) await pool.query(`UPDATE kanban_forum_import SET image_count = $2 WHERE id = $1`, [row.id, images.length])
      recounted++
    }

    if (row.status === 'imported' && row.card_id) {
      const have = await attDB.countCardAttachments(orgId, row.card_id)
      let slot = have
      for (const att of images) {
        if (slot >= MAX_FILES_PER_CARD) break
        if (dry) { slot++; continue }
        const res = await fetch(att.url)
        if (!res.ok) continue
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length > MAX_FILE_SIZE) continue
        const mime = (att.content_type || 'image/jpeg').split(';')[0].trim()
        const meta = await saveKanbanBuffer(row.card_id, buf, { mime, originalName: att.filename || null })
        // คืน null = รูปนี้เคยเข้าไปแล้ว (UNIQUE discord_attachment_id) → ไม่นับ ไม่กินโควตา 4 รูป
        const ins = await attDB.insertAttachment(orgId, row.card_id, {
          ...meta, sort_order: slot, created_by: null,
          discord_attachment_id: String(att.id), discord_message_id: String(att.message_id),
        })
        if (ins) { slot++; added++ }
      }
    }
  } catch (e) {
    failed++
    console.error(`\n  ⚠️  ${row.title.slice(0, 40)}: ${e.message}`)
  }
  await sleep(250)
}
console.log(`\n✅ นับใหม่ ${recounted} แถว · เติมรูปให้การ์ด ${added} รูป · พลาด ${failed}`)
process.exit(0)
