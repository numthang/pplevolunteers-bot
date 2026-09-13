import { gateCase } from '@/lib/caseGate.js'
import { getTimeline, getAttachments } from '@/db/cases.js'
import { getLetterConfig } from '@/db/caseLetterConfig.js'
import { askAiJson, AiError } from '@/lib/ai.js'
import { getPrompt } from '@/db/orgAiPrompts.js'

export async function POST(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { orgId, caseRow } = gate

  const [timeline, attachments, letterConfig] = await Promise.all([
    getTimeline(caseRow.id),
    getAttachments(caseRow.id),
    getLetterConfig(orgId, caseRow.province),
  ])

  // ⚠️ context ต้องครบพอให้เขียนหนังสือได้จริง — ของเดิมส่งแค่เนื้อเคส AI เลยต้อง **เดา**
  //    วันที่รับเรื่อง เลขอ้างอิง และรายการเอกสารแนบเอง ทั้งที่ระบบรู้อยู่แล้วทั้งหมด
  //    (เดา = กุข้อมูลลงหนังสือราชการ ซึ่งเป็นความเสียหายที่แก้ทีหลังไม่ได้)
  const attachmentNames = attachments
    .map(a => a.original_name || (a.mime?.startsWith('image/') ? 'ภาพถ่ายประกอบ' : a.mime))
    .filter(Boolean)

  const caseContext = [
    `เลขที่เรื่องร้องเรียนในระบบ: ${caseRow.ref}`,
    `วันที่รับเรื่อง: ${new Date(caseRow.created_at).toLocaleDateString('th-TH', { dateStyle: 'long' })}`,
    `จังหวัด: ${caseRow.province}`,
    `ประเภท: ${caseRow.category || 'ไม่ระบุ'}`,
    caseRow.complainant_name ? `ผู้ร้องเรียน: ${caseRow.complainant_name}` : '',
    `เรื่อง: ${caseRow.title || ''}`,
    `รายละเอียด: ${caseRow.detail || ''}`,
    caseRow.ai_summary ? `AI สรุป: ${caseRow.ai_summary}` : '',
    timeline.length ? `ความคืบหน้า:\n${timeline.map(e => `- ${e.body}`).join('\n')}` : '',
    attachmentNames.length
      ? `ไฟล์ที่แนบมากับเรื่องร้องเรียนนี้ (${attachmentNames.length} ไฟล์):\n${attachmentNames.map(n => `- ${n}`).join('\n')}`
      : 'ไม่มีไฟล์แนบในระบบ',
  ].filter(Boolean).join('\n')

  // ⛔ เคยตั้งเป็น `task: 'light'` + haiku ("ร่างจดหมายจาก template ไม่ต้องใช้โมเดลตัวใหญ่")
  //    แต่ภาษาราชการไทยที่คมพอส่งออกจริงไม่ใช่งานเบา — ร่างที่ได้ตื้นจนต้องเขียนใหม่ทุกใบ
  //    (user ทัก 2026-09-13) · ยิงไม่บ่อย + output ~1500 token ค่าที่เพิ่มน้อยกว่าเวลาที่เสียไปแก้มือ
  let draft
  try {
    draft = await askAiJson(await getPrompt('case.letter_draft', orgId), `ร่างหนังสือร้องเรียนจากข้อมูลนี้:\n\n${caseContext}`, {
      maxTokens: 2000,
      orgId,
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
