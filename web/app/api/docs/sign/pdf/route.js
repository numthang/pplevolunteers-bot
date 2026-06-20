import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEntryByToken, getEntryById, getSignatureByEntryId } from '@/db/docs/entries.js'
import { generateEntryPdf } from '@/lib/generatePdf.js'

/**
 * GET /api/docs/sign/pdf?token=
 * ดาวน์โหลด PDF ใบสำคัญรับเงินฉบับมีลายเซ็น
 * auth: ผู้รับ (member_discord_id) หรือผู้จ่าย (payer_discord_id) ผ่าน sign token
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  if (!token) return Response.json({ error: 'token required' }, { status: 400 })

  try {
    const entry = await getEntryByToken(token)
    if (!entry) return Response.json({ error: 'ลิงก์ไม่ถูกต้อง' }, { status: 404 })

    const isRecipient = entry.member_discord_id === session.user.discordId
    const isPayer     = entry.payer_discord_id  === session.user.discordId
    if (!isRecipient && !isPayer) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    // ผู้รับยังไม่เซ็น → ยังไม่มี signature แต่ยังให้ดาวน์โหลดได้ (preview ว่าง)
    const full      = await getEntryById(entry.id)
    const recSig    = await getSignatureByEntryId(entry.id, 'recipient')
    const paySig    = await getSignatureByEntryId(entry.id, 'payer')

    const pdf = await generateEntryPdf(full, {
      signatureBase64:      recSig?.signature_base64  ?? null,
      payerSignatureBase64: paySig?.signature_base64  ?? null,
      payerDisplayName:     full.payer_display_name   ?? null,
      payerPosition:        full.payer_position       ?? null,
    })

    const filename = `doc-${full.id}.pdf`
    return new Response(pdf, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control':       'private, no-store',
      },
    })
  } catch (err) {
    console.error('[GET /api/docs/sign/pdf]', err)
    return Response.json({ error: err.message || 'สร้าง PDF ไม่สำเร็จ' }, { status: 500 })
  }
}
