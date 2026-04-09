import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file')
  if (!file) return Response.json({ error: 'No file' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const ext = file.name?.endsWith('.png') ? 'png' : 'jpg'
  const filename = `${randomUUID()}.${ext}`
  const uploadDir = join(process.cwd(), 'public', 'uploads', 'evidence')
  await writeFile(join(uploadDir, filename), buffer)

  return Response.json({ url: `/uploads/evidence/${filename}` })
}
