import { getLetterConfig } from '@/db/caseLetterConfig.js'
import { getOrgConfig } from '@/db/orgConfig.js'
import { generateComplaintLetterPdf } from '@/lib/generateComplaintLetter.js'

/**
 * ประกอบ PDF หนังสือร้องเรียน 1 ใบ — ใช้ร่วมกัน 2 ทาง:
 *   - /api/case/[ref]/letter/generate  (พรีวิวในโมดัล · fields มาจากช่องที่กำลังพิมพ์)
 *   - /complaint/[ref]/letter/[id]     (ลิงก์สาธารณะ · fields มาจากร่างที่บันทึกไว้)
 *
 * หัวจดหมาย/ท้ายจดหมายดึงสดจาก case_letter_config ทุกครั้ง ไม่เอาจากร่าง (ดูหมายเหตุใน CaseLetterModal)
 */

/** ค่าที่ต้องมาจาก config เท่านั้น — ร่างยุคแรก (30 มิ.ย.) แช่ไว้ในร่าง ถ้าปล่อยผ่านมันจะชนะ config เงียบๆ */
const CONFIG_ONLY_KEYS = ['org_name', 'address', 'coordinator_name', 'coordinator_phone']

export class LetterConfigMissingError extends Error {}

/** @returns {Promise<Buffer>} */
export async function buildCaseLetterPdf(orgId, province, letterFields) {
  const config = await getLetterConfig(orgId, province)
  if (!config) throw new LetterConfigMissingError(`ยังไม่มี config หนังสือสำหรับจังหวัด ${province}`)

  const clean = { ...letterFields }
  for (const k of CONFIG_ONLY_KEYS) delete clean[k]

  const fields = {
    org_name:          config.org_name,
    address:           config.address,
    signer_name:       config.signer_name,
    signer_position:   config.signer_position,
    coordinator_name:  config.coordinator_name,
    coordinator_phone: config.coordinator_phone,
    ...clean,
    // ⚠️ **ต้องอยู่หลัง spread** — letterFields มาจาก body ของ client ตรงๆ
    //    ถ้าอยู่ก่อน ผู้เรียกส่ง logo_path เองมาทับได้ = สั่งให้ server อ่านไฟล์ที่ไหนก็ได้
    // โลโก้ 2 ชั้น: ของสาขาจังหวัดนี้ → โลโก้กลางของ org → ตราที่ฝังมากับ template.docx
    logo_path:         config.logo_path || await getOrgConfig(orgId, 'case_letter_logo'),
  }

  return generateComplaintLetterPdf(fields)
}
