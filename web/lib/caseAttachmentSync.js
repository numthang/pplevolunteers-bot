/**
 * นำเข้าไฟล์แนบ (รูป/เสียง) จากเธรด Discord ของเคส → case_attachments
 *
 * ทำไมต้องมี: เดิมไฟล์เข้าระบบได้ทางเดียวคือฟอร์ม intake บนเว็บ · รูปที่คนโพสต์ในเธรด
 * (ซึ่งเป็นเรื่องปกติของเคสร้องเรียน — รูปพื้นที่ หลักฐาน) ไม่เคยถูกเก็บเลย
 *
 * ⚠️ ต้องโหลด bytes มาเก็บเอง ห้ามเก็บแค่ URL — Discord CDN URL มี signature หมดอายุ
 * ⚠️ ใช้ watermark เส้นที่ 2 (`cases.last_attachment_message_id`) แยกจากเส้นของ AI timeline
 *    เพราะเส้นแรกกวาดเลยรูปเก่าไปหมดแล้ว · เริ่มจาก NULL = รอบแรก backfill ทั้งเธรด
 */

import { isAllowedMime, MAX_FILE_SIZE, saveCaseBuffer } from './caseUploads.js'
import { insertAttachment } from '@/db/cases.js'

const API = 'https://discord.com/api/v10'
const TOKEN = process.env.DISCORD_BOT_TOKEN

/** กันโหลดไฟล์รัวเกินไปในรอบเดียว — เหลือไว้ให้รอบถัดไป (watermark เดินหน้าทีละก้อน) */
const MAX_MESSAGES_PER_SYNC = 500
const MAX_FILES_PER_SYNC = 20

const MIME_BY_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg',
}

/** Discord ไม่ส่ง content_type มาเสมอ → เดาจากนามสกุลไฟล์เป็นตัวสำรอง */
function resolveMime(att) {
  if (att.content_type) return att.content_type.split(';')[0].trim()
  const ext = (att.filename || '').split('.').pop()?.toLowerCase()
  return MIME_BY_EXT[ext] || null
}

async function fetchMessagesAfter(threadId, afterId) {
  const msgs = []
  let after = afterId
  while (msgs.length < MAX_MESSAGES_PER_SYNC) {
    const q = new URLSearchParams({ limit: '100' })
    if (after) q.set('after', after)
    const res = await fetch(`${API}/channels/${threadId}/messages?${q}`, {
      headers: { Authorization: `Bot ${TOKEN}` },
    })
    if (!res.ok) throw new Error(`Discord ${res.status}: messages`)
    const batch = await res.json()
    if (!batch.length) break
    msgs.push(...batch)
    if (batch.length < 100) break
    after = batch.at(-1).id
  }
  return msgs.sort((a, b) => a.id.localeCompare(b.id)).slice(0, MAX_MESSAGES_PER_SYNC)
}

/**
 * ดึงไฟล์แนบใหม่ในเธรดมาเก็บ
 *
 * ⚠️ แยก `skipped` (ข้ามถาวร — ชนิดไม่รองรับ/ใหญ่เกิน/เคยนำเข้าแล้ว) ออกจาก `failed`
 *    (พลาดชั่วคราว — โหลดไม่ติด/เขียนดิสก์ไม่ได้) เพราะผู้เรียกใช้ค่านี้ตัดสินใจว่าจะ
 *    เลื่อน watermark ไหม · มี failed = อย่าเลื่อน ไม่งั้นไฟล์นั้นหายถาวรแบบ bug-060
 *
 * @returns {{ imported, skipped, failed, lastMessageId: string|null }}
 */
export async function importThreadAttachments({ threadId, caseId, orgId, afterId }) {
  const empty = { imported: 0, skipped: 0, failed: 0, lastMessageId: null }
  if (!TOKEN || !threadId) return empty

  const msgs = await fetchMessagesAfter(threadId, afterId)
  if (!msgs.length) return empty

  let imported = 0
  let skipped = 0
  let failed = 0

  outer:
  for (const m of msgs) {
    for (const att of m.attachments || []) {
      if (imported >= MAX_FILES_PER_SYNC) break outer

      const mime = resolveMime(att)
      // ชนิดไม่รองรับ / ใหญ่เกิน → ข้ามถาวร ลองใหม่ก็ไม่ผ่าน
      if (!mime || !isAllowedMime(mime) || att.size > MAX_FILE_SIZE) { skipped++; continue }

      try {
        const res = await fetch(att.url)
        if (!res.ok) { failed++; continue }
        const buf = Buffer.from(await res.arrayBuffer())
        // เช็คขนาดจริงซ้ำ — att.size เป็นค่าที่ Discord แจ้ง ไม่ใช่สิ่งที่โหลดมาได้จริง
        if (buf.length > MAX_FILE_SIZE) { skipped++; continue }

        const meta = await saveCaseBuffer(caseId, buf, { mime, originalName: att.filename })
        // ON CONFLICT DO NOTHING → คืน undefined ถ้าไฟล์นี้เคยนำเข้าแล้ว (กดซ้ำ/backfill ทับ)
        const row = await insertAttachment(caseId, orgId, {
          ...meta,
          discord_attachment_id: String(att.id),
          discord_message_id: String(m.id),
        })
        if (row) imported++
        else skipped++
      } catch (e) {
        console.error('[caseAttachmentSync] ดึงไฟล์ไม่สำเร็จ', { attId: att.id, name: att.filename }, e.message)
        failed++
      }
    }
  }

  return { imported, skipped, failed, lastMessageId: msgs.at(-1).id }
}
