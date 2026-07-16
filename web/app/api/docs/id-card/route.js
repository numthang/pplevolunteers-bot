import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEntryByToken } from '@/db/docs/entries.js'
import { saveIdCard } from '@/db/docs/idCard.js'
import { processIdCardImage } from '@/lib/idCard.js'

const MAX_SIZE     = 8 * 1024 * 1024 // 8 MB ก่อนย่อ
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * POST /api/docs/id-card  (multipart: file, token)
 * อัปโหลดสำเนาบัตรของตัวเอง — ผูก guild จาก sign token (signer อาจไม่มี guild cookie)
 * เก็บใน org_members.id_card_image ของ guild นั้น (per-guild)
 */
export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form  = await req.formData()
  const file  = form.get('file')
  const token = form.get('token')

  if (!token) return Response.json({ error: 'token required' }, { status: 400 })
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ error: 'file required' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return Response.json({ error: 'รองรับเฉพาะ JPEG / PNG / WebP' }, { status: 415 })
  }
  if (file.size > MAX_SIZE) {
    return Response.json({ error: 'ไฟล์ใหญ่เกิน 8 MB' }, { status: 413 })
  }

  const entry = await getEntryByToken(token)
  if (!entry) return Response.json({ error: 'ลิงก์ไม่ถูกต้อง' }, { status: 404 })

  try {
    const raw       = Buffer.from(await file.arrayBuffer())
    const processed = await processIdCardImage(raw)   // ย่อ + re-encode JPEG (strip EXIF)
    const ok        = await saveIdCard(session.user.discordId, entry.guild_id, processed)
    if (!ok) return Response.json({ error: 'ไม่พบข้อมูลสมาชิกใน guild นี้' }, { status: 404 })
    return Response.json({ success: true })
  } catch (err) {
    console.error('[POST /api/docs/id-card]', err)
    return Response.json({ error: 'ประมวลผลรูปไม่สำเร็จ' }, { status: 500 })
  }
}
