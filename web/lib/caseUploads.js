/**
 * Case attachments — เก็บไฟล์ภาพ/เสียง "นอก /public" เสิร์ฟผ่าน gated API เท่านั้น
 * convention path เดียวกับ docs (cropDocument.js getUploadPath)
 */

import path from 'path'
import { writeFile, readFile, mkdir } from 'fs/promises'
import { randomUUID } from 'crypto'

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
export const MAX_FILES = 3

// mime → นามสกุลไฟล์ (allowlist — ปฏิเสธ mime อื่นทั้งหมด)
const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/ogg': 'ogg',
}

export function isAllowedMime(mime) {
  return Object.prototype.hasOwnProperty.call(EXT_BY_MIME, mime)
}

export function getCaseUploadDir() {
  return process.env.CASE_UPLOAD_DIR ?? path.join(process.cwd(), '..', 'uploads', 'cases')
}

/**
 * บันทึกไฟล์แนบของเคส → คืน metadata { file_path (relative), original_name, mime }
 * @param {number|string} caseId
 * @param {File} file  web File object จาก formData
 */
export async function saveCaseFile(caseId, file) {
  const mime = file.type
  if (!isAllowedMime(mime)) throw new Error(`ชนิดไฟล์ไม่รองรับ: ${mime}`)
  if (file.size > MAX_FILE_SIZE) throw new Error(`ไฟล์เกิน 10MB: ${file.name}`)

  const dir = path.join(getCaseUploadDir(), String(caseId))
  await mkdir(dir, { recursive: true })

  const ext = EXT_BY_MIME[mime]
  const filename = `${randomUUID()}.${ext}`
  const absPath = path.join(dir, filename)
  const buf = Buffer.from(await file.arrayBuffer())
  await writeFile(absPath, buf)

  // relative path เก็บใน DB (join กับ getCaseUploadDir() ตอนเสิร์ฟ)
  return {
    file_path: path.join(String(caseId), filename),
    original_name: file.name || null,
    mime,
  }
}

/** อ่านไฟล์แนบ (absolute resolve จาก relative path) */
export async function readCaseFile(relativePath) {
  const abs = path.join(getCaseUploadDir(), relativePath)
  return readFile(abs)
}
