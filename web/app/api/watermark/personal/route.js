import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { writeFile, mkdir, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

const ASSETS_DIR   = join(process.cwd(), '..', 'assets', 'watermark')
const MAX_FILES    = 10
const MAX_SIZE     = 5 * 1024 * 1024 // 5 MB
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])
const ALLOWED_EXT  = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

function userDir(discordId) {
  return join(ASSETS_DIR, `user_${discordId}`)
}

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const dir = userDir(session.user.discordId)
  let files = []
  if (existsSync(dir)) {
    files = (await readdir(dir)).filter(f => /\.(png|jpe?g|webp)$/i.test(f))
  }
  return Response.json(files)
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file')
  if (!file) return Response.json({ error: 'No file' }, { status: 400 })

  const mime = file.type?.split(';')[0].trim()
  if (!ALLOWED_MIME.has(mime)) {
    return Response.json({ error: 'ไฟล์ต้องเป็น PNG, JPG หรือ WebP เท่านั้น' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  if (bytes.byteLength > MAX_SIZE) {
    return Response.json({ error: 'ไฟล์ต้องไม่เกิน 5 MB' }, { status: 400 })
  }

  const dir = userDir(session.user.discordId)
  if (!existsSync(dir)) await mkdir(dir, { recursive: true })

  const existing = (await readdir(dir)).filter(f => /\.(png|jpe?g|webp)$/i.test(f))
  if (existing.length >= MAX_FILES) {
    return Response.json({ error: `อัปโหลดได้สูงสุด ${MAX_FILES} ไฟล์` }, { status: 400 })
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9ก-๙._-]/g, '_').slice(0, 80)
  const ext      = ALLOWED_EXT[mime]
  const baseName = safeName.replace(/\.[^.]+$/, '') || 'watermark'
  let filename   = `${baseName}.${ext}`

  if (existsSync(join(dir, filename))) {
    return Response.json({ error: `ไฟล์ชื่อ "${filename}" มีอยู่แล้ว` }, { status: 409 })
  }

  await writeFile(join(dir, filename), Buffer.from(bytes))
  return Response.json({ filename })
}
