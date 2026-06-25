import path from 'path'
import { writeFile, readFile as fsReadFile, unlink, mkdir, access } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { randomUUID } from 'crypto'

const execFileAsync = promisify(execFile)

export function getUploadPath() {
  return process.env.DOCS_UPLOAD_DIR ?? path.join(process.cwd(), '..', 'uploads', 'docs')
}

const PYTHON = process.env.PYTHON_BIN ?? 'python3'
const CROP_SCRIPT = path.join(process.cwd(), '..', 'scripts', 'crop_document.py')

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

export async function readFile(absolutePath) {
  return fsReadFile(absolutePath)
}

export async function removeFile(relativePath) {
  const full = path.join(getUploadPath(), relativePath)
  await unlink(full)
}
