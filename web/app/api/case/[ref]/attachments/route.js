import { gateCase } from '@/lib/caseGate.js'
import { getAttachments, insertAttachment } from '@/db/cases.js'
import { logAction } from '@/db/auditLog.js'
import {
  saveCaseFile, isAllowedMime, MAX_FILE_SIZE, MAX_FILES_PER_CASE,
} from '@/lib/caseUploads.js'

/**
 * POST /api/case/[ref]/attachments — เจ้าหน้าที่แนบไฟล์เพิ่มเข้าเคสจากหน้าจัดการ
 *
 * ก่อนหน้านี้ไฟล์เข้าเคสได้ 2 ทางเท่านั้น: ฟอร์มสาธารณะตอนแจ้งเรื่อง กับ sync จากเธรด Discord
 * → เคสที่ไม่มีเธรดไม่มีทางเพิ่มไฟล์เลย (ขัดเป้าหมาย "ไม่มี Discord ก็ใช้ได้")
 *
 * ⚠️ เพดานนับจาก **ไฟล์ที่มีอยู่จริงในเคส** ไม่ใช่จำนวนไฟล์ต่อคำขอแบบฟอร์มสาธารณะ
 *    (นับต่อคำขอ = ยิงซ้ำหลายรอบก็ทะลุได้)
 * ⚠️ validate mime/ขนาดฝั่ง server เสมอ — accept ใน <input> เป็นแค่ตัวกรองในจอ
 */
export async function POST(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { orgId, caseRow, session } = gate

  let form
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'อ่านไฟล์ไม่สำเร็จ' }, { status: 400 })
  }

  const files = form.getAll('files').filter(f => typeof f === 'object' && f.size > 0)
  if (files.length === 0) return Response.json({ error: 'ไม่มีไฟล์ที่จะแนบ' }, { status: 400 })

  const existing = await getAttachments(caseRow.id)
  if (existing.length + files.length > MAX_FILES_PER_CASE) {
    const left = Math.max(0, MAX_FILES_PER_CASE - existing.length)
    return Response.json(
      { error: left === 0
        ? `เคสนี้แนบไฟล์ครบเพดาน ${MAX_FILES_PER_CASE} ไฟล์แล้ว — ลบไฟล์เก่าก่อนถึงจะแนบเพิ่มได้`
        : `เคสนี้แนบไฟล์ได้อีก ${left} ไฟล์ (สูงสุด ${MAX_FILES_PER_CASE} ไฟล์ต่อเคส)` },
      { status: 400 },
    )
  }

  for (const f of files) {
    if (!isAllowedMime(f.type)) return Response.json({ error: `ชนิดไฟล์ไม่รองรับ: ${f.type || 'ไม่ทราบชนิด'}` }, { status: 400 })
    if (f.size > MAX_FILE_SIZE) return Response.json({ error: `ไฟล์เกิน 10MB: ${f.name || ''}` }, { status: 400 })
  }

  // ล้มทีละไฟล์ ไม่ล้มทั้งคำขอ — ไฟล์ที่ผ่านแล้วต้องไม่หายเพราะไฟล์ท้ายๆ พัง
  const saved = []
  const failed = []
  for (const f of files) {
    try {
      const meta = await saveCaseFile(caseRow.id, f)
      const row = await insertAttachment(caseRow.id, orgId, meta)
      if (row) saved.push(row)
    } catch (e) {
      console.error('[POST /api/case/[ref]/attachments]', e.message)
      failed.push(f.name || '')
    }
  }

  if (saved.length === 0) return Response.json({ error: 'บันทึกไฟล์ไม่สำเร็จ' }, { status: 500 })

  logAction({
    orgId, app: 'cases', action: 'case.attachment_added',
    actorId: session.user.userId, targetId: caseRow.ref,
    meta: { count: saved.length, names: saved.map(a => a.original_name).filter(Boolean) },
  })

  return Response.json({ ok: true, added: saved.length, failed })
}
