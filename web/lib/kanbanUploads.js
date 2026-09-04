/**
 * ไฟล์แนบของการ์ด KANBAN — เก็บ "นอก /public" เสิร์ฟผ่าน API ที่เช็คสิทธิ์เท่านั้น
 *
 * ⭐ ยืมกติกาชนิดไฟล์/ขนาดจาก caseUploads.js ตรงๆ (import มา ไม่ก็อป) — ต่างกันแค่โฟลเดอร์ปลายทาง
 *    ที่ต้องแยกเพราะสิทธิ์คนละชุด (เคส = caseworker + กรองจังหวัด · การ์ด = คนใน org)
 *
 * ⛔ ห้ามเก็บ URL ของ Discord แทนไฟล์ — CDN URL มี signature หมดอายุ (ดู caseAttachmentSync.js)
 */

import path from 'path'
import { writeFile, readFile, mkdir, unlink } from 'fs/promises'
import { randomUUID } from 'crypto'
import { isAllowedMime, MAX_FILE_SIZE } from './caseUploads.js'

export { isAllowedMime, MAX_FILE_SIZE }

/** เพดานต่อการ์ด — ตรงกับ "รูปสัก 4 รูป" ที่ตกลงไว้ตอนออกแบบ import กระทู้ */
export const MAX_FILES_PER_CARD = 4

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/ogg': 'ogg',
}

export function getKanbanUploadDir() {
  return process.env.KANBAN_UPLOAD_DIR ?? path.join(process.cwd(), '..', 'uploads', 'kanban')
}

/** เขียน buffer ลงดิสก์ → คืน metadata ที่เอาไปลง DB ได้ตรงๆ */
async function save(cardId, buf, { mime, originalName = null }) {
  if (!isAllowedMime(mime)) throw new Error(`ชนิดไฟล์ไม่รองรับ: ${mime}`)
  if (buf.length > MAX_FILE_SIZE) throw new Error(`ไฟล์เกิน 10MB: ${originalName || mime}`)

  const dir = path.join(getKanbanUploadDir(), String(cardId))
  await mkdir(dir, { recursive: true })

  const filename = `${randomUUID()}.${EXT_BY_MIME[mime]}`
  await writeFile(path.join(dir, filename), buf)

  return { file_path: path.join(String(cardId), filename), original_name: originalName, mime }
}

/** จาก <input type=file> (web File object) */
export async function saveKanbanFile(cardId, file) {
  if (!isAllowedMime(file.type)) throw new Error(`ชนิดไฟล์ไม่รองรับ: ${file.type}`)
  if (file.size > MAX_FILE_SIZE) throw new Error(`ไฟล์เกิน 10MB: ${file.name}`)
  return save(cardId, Buffer.from(await file.arrayBuffer()), { mime: file.type, originalName: file.name || null })
}

/** จาก Buffer — ใช้กับรูปที่ดึงมาจาก Discord ตอน import กระทู้ */
export async function saveKanbanBuffer(cardId, buf, meta) {
  return save(cardId, buf, meta)
}

export async function readKanbanFile(relativePath) {
  return readFile(path.join(getKanbanUploadDir(), relativePath))
}

/**
 * ลบไฟล์ออกจากดิสก์ — ใช้ตอนลบไฟล์แนบ 1 ตัว และตอน **ลบการ์ดถาวร**
 * ⚠️ ห้าม throw — DB ลบไปแล้ว ล้มตรงนี้ต้องไม่ทำให้ทั้ง request พัง (กติกาเดียวกับ deleteCaseFiles)
 */
export async function deleteKanbanFiles(relativePaths = []) {
  let n = 0
  for (const rel of relativePaths) {
    if (!rel) continue
    try {
      await unlink(path.join(getKanbanUploadDir(), rel))
      n++
    } catch (e) {
      if (e.code !== 'ENOENT') console.error('[kanbanUploads] ลบไฟล์ไม่สำเร็จ', rel, e.message)
    }
  }
  return n
}
