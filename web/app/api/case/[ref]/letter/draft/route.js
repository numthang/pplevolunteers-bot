import { gateCase } from '@/lib/caseGate.js'
import { getTimeline } from '@/db/cases.js'
import { getLetterConfig } from '@/db/caseLetterConfig.js'
import { askAiJson, AiError } from '@/lib/ai.js'

const SYSTEM = `คุณช่วยร่างหนังสือร้องเรียนทางราชการภาษาไทยสำหรับทีมงานพรรคการเมือง
ตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น:
{
  "subject": "หัวข้อเรื่องที่กระชับ ไม่เกิน 1 บรรทัด",
  "recipient_title": "ตำแหน่งผู้รับ เช่น ผู้อำนวยการ / นายอำเภอ / นายก อบต.",
  "recipient_name": "ชื่อหน่วยงาน/บุคคลที่ส่งถึง",
  "body": "เนื้อหาหนังสือ 2-4 ย่อหน้า ภาษาราชการสุภาพ ย่อหน้าคั่นด้วย \\n\\n",
  "attachments": "รายการเอกสารแนบ คั่นด้วย \\n- หรือ - ถ้าไม่มีใส่ -"
}

กฎ:
- ใช้ภาษาราชการไทยสุภาพ
- recipient ให้เดาจากประเภทปัญหา (ที่ดิน→กรมป่าไม้/สำนักงานที่ดิน, ถนน→แขวงทาง/อบจ, น้ำ/ไฟ→ อบต./PEA/PWA, สิทธิ/สวัสดิการ→พัฒนาสังคม)
- body ขึ้นต้นด้วย "ด้วย..." หรือ "ตามที่..." และลงท้ายด้วย "จึงเรียนมาเพื่อโปรดพิจารณา"`

export async function POST(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { orgId, caseRow } = gate

  const timeline = await getTimeline(caseRow.id)
  const letterConfig = await getLetterConfig(orgId, caseRow.province)

  const caseContext = [
    `จังหวัด: ${caseRow.province}`,
    `ประเภท: ${caseRow.category || 'ไม่ระบุ'}`,
    `เรื่อง: ${caseRow.title || ''}`,
    `รายละเอียด: ${caseRow.detail || ''}`,
    caseRow.ai_summary ? `AI สรุป: ${caseRow.ai_summary}` : '',
    timeline.length ? `ความคืบหน้า:\n${timeline.map(e => `- ${e.body}`).join('\n')}` : '',
  ].filter(Boolean).join('\n')

  // งานเบา — ร่างจดหมายจาก template ไม่ต้องใช้โมเดลตัวใหญ่
  let draft
  try {
    draft = await askAiJson(SYSTEM, `ร่างหนังสือร้องเรียนจากข้อมูลนี้:\n\n${caseContext}`, {
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 1500,
      orgId,
      task: 'light',
    })
  } catch (e) {
    console.error('[letter/draft] AI error:', e.message)
    return Response.json({ error: e instanceof AiError ? e.message : 'AI ไม่สำเร็จ' }, { status: e?.code === 'quota' ? 429 : 502 })
  }

  return Response.json({
    draft,
    letterConfig: letterConfig ? {
      org_name: letterConfig.org_name,
      address: letterConfig.address,
      signer_name: letterConfig.signer_name,
      signer_position: letterConfig.signer_position,
      coordinator_name: letterConfig.coordinator_name,
      coordinator_phone: letterConfig.coordinator_phone,
    } : null,
  })
}
