import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEntryByToken, getEntryById } from '@/db/docs/entries.js'
import { generateEntryPdf } from '@/lib/generatePdf.js'

/**
 * GET /api/docs/sign/preview?token=
 * แสดงตัวอย่างใบสำคัญรับเงิน (ยังไม่มีลายเซ็น) ให้คนเซ็นดูก่อนเซ็น
 * auth ด้วย sign token เอง — ไม่ต้อง canManageDocs (คนเซ็นไม่ใช่ manager)
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
    if (entry.token_expires_at && new Date(entry.token_expires_at) < new Date()) {
      return Response.json({ error: 'ลิงก์หมดอายุแล้ว' }, { status: 410 })
    }

    // ดึง entry เต็ม (มี project_name + id_card_image) เพื่อ generate ให้ตรงกับใบจริง
    const full = await getEntryById(entry.id)
    const pdf  = await generateEntryPdf(full, { signatureBase64: null })

    return new Response(pdf, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': 'inline; filename="preview.pdf"',
        'Cache-Control':       'private, no-store',
      },
    })
  } catch (err) {
    console.error('[GET /api/docs/sign/preview]', err)
    return Response.json({ error: err.message || 'สร้างตัวอย่างไม่สำเร็จ' }, { status: 500 })
  }
}
