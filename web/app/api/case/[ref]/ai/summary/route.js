import { gateCase } from '@/lib/caseGate.js'
import { getTimeline, setAiSummary } from '@/db/cases.js'
import { askAi, AiError } from '@/lib/ai.js'
import { getPrompt } from '@/db/orgAiPrompts.js'

/**
 * POST /api/case/[ref]/ai/summary — สรุปเนื้อหาเคสด้วย AI แบบกดเอง (ไม่ auto)
 * สรุปจาก title/detail/timeline ที่มีอยู่แล้ว (ไม่ใช่ raw Discord thread แบบเดิมที่บอทเคยทำตอน import)
 * บันทึกลง cases.ai_summary เดิม — ถูกใช้เป็นบริบทของ letter/draft ต่ออยู่แล้ว
 */
export async function POST(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { orgId, caseRow } = gate

  const timeline = await getTimeline(caseRow.id)

  const caseContext = [
    `เรื่อง: ${caseRow.title || ''}`,
    `รายละเอียด: ${caseRow.detail || ''}`,
    timeline.length ? `ความคืบหน้า:\n${timeline.map(e => `- ${e.body}`).join('\n')}` : '',
  ].filter(Boolean).join('\n')

  let summary
  try {
    summary = await askAi(await getPrompt('case.summary', orgId), caseContext, {
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 500,
      orgId,
      task: 'light',
    })
  } catch (e) {
    console.error('[case/ai/summary] AI error:', e.message)
    return Response.json({ error: e instanceof AiError ? e.message : 'AI ไม่สำเร็จ' }, { status: e?.code === 'quota' ? 429 : 502 })
  }

  await setAiSummary(caseRow.id, summary)
  return Response.json({ summary })
}
