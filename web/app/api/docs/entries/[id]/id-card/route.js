import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs, canAccessEvent } from '@/lib/docsAccess.js'
import { getEntryByIdSimple } from '@/db/docs/entries.js'
import { getDocsSignPolicy } from '@/db/orgConfig.js'
import { processIdCardImage } from '@/lib/idCard.js'
import { saveIdCard, getIdCard } from '@/db/docs/idCard.js'

const MAX_SIZE     = 8 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

async function gate(session, id) {
  if (!session?.user?.userId) return { error: 'Unauthorized', status: 401 }
  const { access } = await getEffectiveIdentity(session)
  if (!canManageDocs(access)) return { error: 'Forbidden', status: 403 }
  const entry = await getEntryByIdSimple(id)
  if (!entry) return { error: 'Not found', status: 404 }
  if (!canAccessEvent(entry.province, access)) return { error: 'Forbidden', status: 403 }
  if (!entry.member_user_id) return { error: 'ใบนี้ผู้รับไม่ใช่สมาชิก', status: 409 }
  // flexible กับ open ต้องไปด้วยกัน — เงื่อนไขจริงคือ "ผู้ดูแลจัดการแทนสมาชิกได้ไหม"
  // ซึ่ง open (หลวมกว่า) ก็ต้องได้ · ตัวคุมจริงคือ canManageDocs + canAccessEvent ข้างบน
  const policy = await getDocsSignPolicy(entry.org_id)
  if (policy !== 'flexible' && policy !== 'open') {
    return { error: 'องค์กรนี้ตั้งให้สมาชิกแนบบัตรเอง — เปลี่ยนได้ที่ ตั้งค่าเอกสาร', status: 403 }
  }
  return { entry }
}

/**
 * POST /api/docs/entries/[id]/id-card  (multipart: file)
 * ผู้ดูแลแนบสำเนาบัตรแทนสมาชิก — เก็บลง users.id_card_image ของ **ผู้รับ**
 *
 * ⚠️ ต่างจาก /api/docs/id-card ที่เขียนลงบัญชีคนที่ล็อกอินเสมอ (แอดมินกดที่นั่น = ทับบัตรตัวเอง)
 *
 * บัตรใช้ร่วมกันทุกใบของคนนั้น → ถ้ามีอยู่แล้วต้องส่ง ?overwrite=1 มายืนยัน ไม่ทับเงียบๆ
 * (ทับผิด = ใบเก่าที่ออกไปแล้วเปลี่ยนตามหมด เพราะ PDF สร้างสดทุกครั้ง)
 *
 * ⚠️ เคยถอดด่านนี้ออกไปรอบหนึ่ง 2026-08-26 แล้วคืนกลับวันเดียวกัน — เหตุผลที่ถอด
 * ("กด Cancel แล้วข้อมูลกับรูปขัดกันเอง") เป็นปัญหาจริง แต่เกิดจากหน้าเว็บ**ถามตอนปลายทาง**
 * ตอนอัปโหลดซึ่งข้อมูลเซฟไปแล้ว · แก้ที่หน้าเว็บให้ถามตอนกด "เปลี่ยนรูป" แทน
 * (กด Cancel = ยังไม่มีอะไรเกิดขึ้นเลย) ไม่ใช่ถอดด่านฝั่ง server ทิ้ง
 */
export async function POST(req, { params }) {
  const { id } = await params
  const g = await gate(await getServerSession(authOptions), id)
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const overwrite = new URL(req.url).searchParams.get('overwrite') === '1'
  if (!overwrite && await getIdCard(g.entry.member_user_id)) {
    return Response.json({ error: 'ผู้รับมีสำเนาบัตรอยู่แล้ว', code: 'exists' }, { status: 409 })
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!file || typeof file.arrayBuffer !== 'function') return Response.json({ error: 'file required' }, { status: 400 })
  if (!ALLOWED_MIME.has(file.type)) return Response.json({ error: 'รองรับเฉพาะ JPEG / PNG / WebP' }, { status: 415 })
  if (file.size > MAX_SIZE)         return Response.json({ error: 'ไฟล์ใหญ่เกิน 8 MB' }, { status: 413 })

  try {
    const processed = await processIdCardImage(Buffer.from(await file.arrayBuffer()))
    const ok = await saveIdCard(g.entry.member_user_id, processed)
    if (!ok) return Response.json({ error: 'ไม่พบบัญชีผู้รับ' }, { status: 404 })
    return Response.json({ success: true })
  } catch (err) {
    console.error('[POST /api/docs/entries/:id/id-card]', err)
    return Response.json({ error: 'ประมวลผลรูปไม่สำเร็จ' }, { status: 500 })
  }
}
