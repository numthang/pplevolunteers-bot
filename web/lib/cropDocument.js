import path from 'path'
import { writeFile, readFile as fsReadFile, unlink, mkdir, readdir } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { randomUUID } from 'crypto'

const execFileAsync = promisify(execFile)

export function getUploadPath() {
  return process.env.DOCS_UPLOAD_DIR ?? path.join(process.cwd(), '..', 'uploads', 'docs')
}

const PYTHON     = process.env.PYTHON_BIN ?? 'python3'
const PDF_SCRIPT  = path.join(process.cwd(), '..', 'scripts', 'docs', 'build_pdf.py')

export function sanitizeProjectName(name) {
  return (name || 'document').replace(/\s+/g, '_').replace(/[^฀-๿a-zA-Z0-9_-]/g, '').slice(0, 80)
}

export function getRegPdfFilename(projectName) {
  return `แนบท้าย3-${sanitizeProjectName(projectName)}.pdf`
}

export function getRegPdfPath(projectId, projectName) {
  return path.join(getUploadPath(), String(projectId), getRegPdfFilename(projectName))
}

/** บันทึกรูปที่ผู้ใช้ครอบเอง (จาก DocImageCropper — เป็น JPEG อยู่แล้ว) ไม่มี auto-crop อีกต่อไป */
export async function saveAttachmentImage(buffer, projectId) {
  const uploadDir = path.join(getUploadPath(), String(projectId))
  await mkdir(uploadDir, { recursive: true })

  const outName = `${randomUUID()}.jpg`
  const outPath = path.join(uploadDir, outName)
  await writeFile(outPath, buffer)

  return path.join(String(projectId), outName)
}

/** รวมรูปทั้งหมดใน project เป็น PDF — fire-and-forget safe (atomic write ใน build_pdf.py) */
export async function buildRegistrationPdf(projectId, projectName, attachmentRelPaths) {
  const pdfPath = getRegPdfPath(projectId, projectName)
  if (!attachmentRelPaths.length) {
    await unlink(pdfPath).catch(() => {})
    return
  }
  const absPaths = attachmentRelPaths.map(r => path.join(getUploadPath(), r))
  try {
    await execFileAsync(PYTHON, [PDF_SCRIPT, ...absPaths, pdfPath], { timeout: 60000 })
  } catch (err) {
    console.error('[buildRegistrationPdf]', err.message)
  }
}

export async function readFile(absolutePath) {
  return fsReadFile(absolutePath)
}

export async function removeFile(relativePath) {
  const full = path.join(getUploadPath(), relativePath)
  await unlink(full)

  // ลบต้นฉบับที่เก็บคู่ไว้ด้วย (`<uuid>.orig.<ext>`) — ไฟล์เก่าที่อัปก่อน 2026-08-09 ไม่มี ก็ข้ามไป
  const dir = path.dirname(full)
  const base = path.basename(full).replace(/\.[^.]+$/, '')
  const siblings = await readdir(dir).catch(() => [])
  await Promise.all(
    siblings
      .filter(f => f.startsWith(`${base}.orig.`))
      .map(f => unlink(path.join(dir, f)).catch(() => {}))
  )
}
