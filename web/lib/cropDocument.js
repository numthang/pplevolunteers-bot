import path from 'path'
import { writeFile, readFile as fsReadFile, unlink, mkdir, access } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { randomUUID } from 'crypto'

const execFileAsync = promisify(execFile)

export function getUploadPath() {
  return process.env.DOCS_UPLOAD_DIR ?? path.join(process.cwd(), '..', 'uploads', 'docs')
}

const PYTHON     = process.env.PYTHON_BIN ?? 'python3'
const CROP_SCRIPT = path.join(process.cwd(), '..', 'scripts', 'crop_document.py')
const PDF_SCRIPT  = path.join(process.cwd(), '..', 'scripts', 'build_pdf.py')

export function sanitizeProjectName(name) {
  return (name || 'document').replace(/\s+/g, '_').replace(/[^฀-๿a-zA-Z0-9_-]/g, '').slice(0, 80)
}

export function getRegPdfFilename(projectName) {
  return `แนบท้าย3-${sanitizeProjectName(projectName)}.pdf`
}

export function getRegPdfPath(projectId, projectName) {
  return path.join(getUploadPath(), String(projectId), getRegPdfFilename(projectName))
}

export async function cropAndSave(buffer, projectId) {
  const uploadDir = path.join(getUploadPath(), String(projectId))
  await mkdir(uploadDir, { recursive: true })

  const uuid = randomUUID()
  const tmpIn  = path.join(uploadDir, `tmp_${uuid}_in.jpg`)
  const outName = `${uuid}.jpg`
  const outPath = path.join(uploadDir, outName)

  await writeFile(tmpIn, buffer)

  try {
    await execFileAsync(PYTHON, [CROP_SCRIPT, tmpIn, outPath], { timeout: 30000 })
  } catch (err) {
    // exit code 1 = no document detected, script wrote resized fallback — OK
    if (err.code !== 1) throw err
  } finally {
    await unlink(tmpIn).catch(() => {})
  }

  // If script failed to write output (e.g. missing cv2), save original buffer as fallback
  const outExists = await access(outPath).then(() => true).catch(() => false)
  if (!outExists) await writeFile(outPath, buffer)

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
}
