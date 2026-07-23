import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership, setOrgIcon } from '@/db/orgMembers.js'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

// POST /api/org/orgs/[id]/icon — อัปโหลดรูป icon org (owner only · gate ด้วย org-owner ไม่ใช่ discordId
//   เพราะ owner อาจเป็น email user ที่ไม่มี discord)
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MAX_SIZE = 2 * 1024 * 1024 // 2MB

export async function POST(req, { params }) {
  const session = await getOrgSession()
  const userId = session?.user?.userId
  if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const orgId = Number((await params).id)
  const membership = await getOrgMembership(orgId, userId)
  if (!membership || membership.status !== 'active' || membership.role !== 'owner') {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const fd = await req.formData()
  const file = fd.get('file')
  if (!file || typeof file === 'string') return Response.json({ error: 'ไม่พบไฟล์' }, { status: 400 })

  const ext = MIME_EXT[file.type]
  if (!ext) return Response.json({ error: 'รองรับเฉพาะ JPEG, PNG, WEBP' }, { status: 400 })
  if (file.size > MAX_SIZE) return Response.json({ error: 'ไฟล์ใหญ่เกินไป (จำกัด 2MB)' }, { status: 413 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const filename = `${randomUUID()}.${ext}`
  const dir = join(process.cwd(), 'public', 'uploads', 'org')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, filename), buffer)

  const org = await setOrgIcon(orgId, `/uploads/org/${filename}`)
  return Response.json({ org })
}
