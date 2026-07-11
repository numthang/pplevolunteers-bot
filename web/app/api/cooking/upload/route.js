import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'ต้อง login ก่อน' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file')
  if (!file) return Response.json({ error: 'ไม่พบไฟล์' }, { status: 400 })

  const ext = MIME_EXT[file.type]
  if (!ext) {
    return Response.json(
      { error: 'รองรับเฉพาะไฟล์รูปภาพ JPEG, PNG, WEBP เท่านั้น' },
      { status: 400 }
    )
  }

  if (file.size > MAX_SIZE) {
    return Response.json({ error: 'ไฟล์ใหญ่เกินไป (จำกัด 5MB)' }, { status: 413 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const filename = `${randomUUID()}.${ext}`
  const uploadDir = join(process.cwd(), 'public', 'uploads', 'cooking')
  await mkdir(uploadDir, { recursive: true })
  await writeFile(join(uploadDir, filename), buffer)

  return Response.json({ url: `/uploads/cooking/${filename}` })
}
