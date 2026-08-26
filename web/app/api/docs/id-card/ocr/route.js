import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { askAiVisionJson, AiError } from '@/lib/ai.js'
import { processIdCardImage } from '@/lib/idCard.js'
import { isValidThaiId, digitsOnly } from '@/lib/thaiId.js'
import { findByIdNumber } from '@/db/docs/externalPayees.js'
import { getEntryByToken } from '@/db/docs/entries.js'
import { consumeDocsOcrQuota, DOCS_OCR_DAILY_LIMIT } from '@/lib/docsOcrQuota.js'

const MAX_SIZE     = 8 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

// "ห้ามเดา ใส่ null" คือบรรทัดที่สำคัญที่สุดในพรอมป์ตนี้ — โหมดพังของ vision model คือ
// เติมค่าที่ดูสมเหตุสมผลให้เนียนๆ ต่างจาก OCR เดิมที่พังแล้วเห็นเป็นขยะทันที
const SYSTEM = `คุณคือตัวอ่านบัตรประจำตัวประชาชนไทย อ่านเฉพาะสิ่งที่เห็นในรูปเท่านั้น
ห้ามเดา ห้ามเติมข้อมูลที่ไม่ได้อยู่ในรูป — ช่องไหนอ่านไม่ออกหรือไม่มีในบัตร ให้ใส่ null
คืนคีย์เหล่านี้ให้ครบทุกตัว:
{
  "title": "คำนำหน้า เช่น นาย/นาง/นางสาว",
  "first_name": "ชื่อตัว (ไม่รวมคำนำหน้า)",
  "last_name": "ชื่อสกุล",
  "id_number": "เลขประจำตัวประชาชน 13 หลัก ตัวเลขล้วนไม่มีขีด",
  "house_no": "บ้านเลขที่",
  "moo": "หมู่ที่ (ตัวเลขล้วน ไม่ต้องมีคำว่าหมู่)",
  "road": "ถนน หรือ ซอย",
  "subdistrict": "ตำบล หรือ แขวง (ไม่ต้องมีคำว่า ต./แขวง)",
  "district": "อำเภอ หรือ เขต (ไม่ต้องมีคำว่า อ./เขต)",
  "province": "จังหวัด (ไม่ต้องมีคำว่า จ.)",
  "zip_code": "รหัสไปรษณีย์ ถ้ามี"
}
ที่อยู่บนบัตรเขียนติดกันเป็นบรรทัดยาว ให้แยกลงช่องให้ถูกต้อง
ถ้ารูปนี้ไม่ใช่บัตรประจำตัวประชาชนไทย ให้คืน {"error":"not_id_card"}`

/**
 * POST /api/docs/id-card/ocr  (multipart: file)
 * อ่านบัตร → คืนค่าที่ได้ให้ไปเติมในฟอร์ม — **ไม่แตะ DB** (กฎ Create: สร้างแถวตอนกดบันทึกเท่านั้น)
 *
 * ใช้ร่วมกันทั้งฟอร์มคนนอกและฟอร์มกรอกข้อมูลให้สมาชิก — มันแค่อ่านบัตร ไม่รู้ว่าปลายทางคือใคร
 * (`existing` ที่ตอบกลับมามีประโยชน์เฉพาะฝั่งคนนอก ฝั่งสมาชิกไม่ต้องสนใจ)
 */
export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  const token = form.get('token')

  // 2 ประตู: ผู้ดูแลเอกสาร (ฟอร์มฝั่งแอดมิน) หรือ เจ้าของใบเปิดลิงก์เซ็นของตัวเอง
  // ประตูที่ 2 ทำให้ผู้เรียกกลายเป็นสมาชิกทั่วไป → org ต้องมาจากใบ ไม่ใช่ cookie
  // (คนเปิดลิงก์เซ็นอาจไม่มี active org) และต้องมีโควตากันยิงรัว
  let orgId = null
  if (token) {
    const entry = await getEntryByToken(String(token))
    if (!entry) return Response.json({ error: 'ลิงก์ไม่ถูกต้อง' }, { status: 404 })
    if (entry.signer_role !== 'recipient' || entry.member_user_id !== session.user.userId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    orgId = entry.org_id
  } else {
    const { access } = await getEffectiveOrgIdentity(session)
    if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })
    orgId = await getOrgId(session)
  }
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ error: 'file required' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return Response.json({ error: 'รองรับเฉพาะ JPEG / PNG / WebP' }, { status: 415 })
  }
  if (file.size > MAX_SIZE) {
    return Response.json({ error: 'ไฟล์ใหญ่เกิน 8 MB' }, { status: 413 })
  }

  const quota = await consumeDocsOcrQuota(session.user.userId)
  if (!quota.ok) {
    return Response.json(
      { error: `อ่านบัตรด้วย AI ได้วันละ ${DOCS_OCR_DAILY_LIMIT} ครั้ง — วันนี้ครบแล้ว ลองพรุ่งนี้ หรือกรอกข้อมูลเอง` },
      { status: 429 }
    )
  }

  try {
    // ย่อ + re-encode JPEG + strip EXIF ก่อนส่งออก — ส่งไฟล์กล้องเต็มๆ ทั้งเปลืองและมี GPS ติดไปด้วย
    const processed = await processIdCardImage(Buffer.from(await file.arrayBuffer()))
    const data = await askAiVisionJson(SYSTEM, 'อ่านบัตรใบนี้', processed, { orgId })

    if (data?.error === 'not_id_card') {
      return Response.json({ error: 'รูปนี้ไม่ใช่บัตรประจำตัวประชาชน — ลองถ่ายใหม่ หรือกรอกข้อมูลเอง' }, { status: 422 })
    }

    const idNumber = digitsOnly(data?.id_number)
    // checksum ไม่ผ่าน = อ่านเลขเพี้ยน — ยังส่งค่ากลับไปให้แก้ในฟอร์ม แต่ต้องบอกให้รู้
    const idValid = idNumber ? isValidThaiId(idNumber) : false

    // มีในระบบแล้วไหม — ตอบไปด้วยเลย ฝั่ง UI จะได้เสนอ "ใช้คนเดิม" แทนสร้างซ้ำ
    const existing = idValid ? await findByIdNumber(orgId, idNumber) : null

    return Response.json({
      success: true,
      data: {
        title:       data?.title       ?? null,
        first_name:  data?.first_name  ?? null,
        last_name:   data?.last_name   ?? null,
        id_number:   idNumber || null,
        house_no:    data?.house_no    ?? null,
        moo:         data?.moo         ?? null,
        road:        data?.road        ?? null,
        subdistrict: data?.subdistrict ?? null,
        district:    data?.district    ?? null,
        province:    data?.province    ?? null,
        zip_code:    data?.zip_code    ?? null,
      },
      idValid,
      existing,
    })
  } catch (err) {
    if (err instanceof AiError) {
      return Response.json({ error: err.message }, { status: err.code === 'quota' ? 429 : 502 })
    }
    console.error('[POST /api/docs/id-card/ocr]', err)
    return Response.json({ error: 'อ่านบัตรไม่สำเร็จ' }, { status: 500 })
  }
}
