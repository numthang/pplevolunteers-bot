import { gateCase } from '@/lib/caseGate.js'
import { getTimeline } from '@/db/cases.js'
import { getLetterConfig } from '@/db/caseLetterConfig.js'
import { askAiJson, AiError } from '@/lib/ai.js'
import { getPrompt } from '@/db/orgAiPrompts.js'

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
    draft = await askAiJson(await getPrompt('case.letter_draft', orgId), `ร่างหนังสือร้องเรียนจากข้อมูลนี้:\n\n${caseContext}`, {
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
