import { getPublicLetterDraft } from '@/db/cases.js'
import { buildCaseLetterPdf } from '@/lib/caseLetterPdf.js'

/**
 * GET /complaint/[ref]/letter/[draftId] — PDF หนังสือร้องเรียน **เปิดได้โดยไม่ต้องล็อกอิน**
 *
 * ไว้ส่งต่อให้ผู้รับหนังสือ/ผู้ร้อง เปิดจากมือถือได้เลย ไม่ต้องมีบัญชี
 * สิทธิ์ = capability URL: ใครถือลิงก์เปิดได้ ความลับคือ draftId (uuid v4 · 122 bit)
 * ลิงก์อยู่ใน cases.letters ซึ่งเห็นได้เฉพาะคนที่ผ่าน gateCase อยู่แล้ว · ลบร่าง = ลิงก์ตาย 404
 *
 * สร้าง PDF สดทุกครั้ง (ไม่แช่ไฟล์) → แก้ร่างแล้วลิงก์เดิมได้ฉบับใหม่ทันที
 * และหัว/ท้ายจดหมายตามที่อยู่สาขาล่าสุดเสมอ เหมือนพรีวิวในโมดัล
 */
export async function GET(req, { params }) {
  const { ref, draftId } = await params

  const found = await getPublicLetterDraft(ref, draftId)
  if (!found) return new Response('Not Found', { status: 404 })

  const { id, saved_at, ...fields } = found.draft

  try {
    const pdfBuf = await buildCaseLetterPdf(found.orgId, found.province, fields)
    return new Response(pdfBuf, {
      headers: {
        'Content-Type': 'application/pdf',
        // inline = เปิดในเบราว์เซอร์เลย ไม่เด้งดาวน์โหลด · ชื่อไฟล์ใช้ตอนกดเซฟ
        'Content-Disposition': `inline; filename="complaint-${ref}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[complaint/letter public]', err)
    return new Response('สร้างเอกสารไม่สำเร็จ', { status: 500 })
  }
}
