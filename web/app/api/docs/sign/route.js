import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEntryByToken, signEntry } from '@/db/docs/entries.js'
import { getDocsSignPolicy } from '@/db/orgConfig.js'

/**
 * POST /api/docs/sign
 * Submit e-signature for an entry (recipient or payer)
 * Body: { token, signatureBase64 }
 */
export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { token, signatureBase64 } = body

    if (!token || !signatureBase64) {
      return Response.json({ error: 'token and signatureBase64 required' }, { status: 400 })
    }

    const entry = await getEntryByToken(token)
    if (!entry) {
      return Response.json({ error: 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว' }, { status: 404 })
    }

    const role = entry.signer_role  // 'recipient' | 'payer'

    if (entry.signer_token_expires_at && new Date(entry.signer_token_expires_at) < new Date()) {
      return Response.json({ error: 'ลิงก์หมดอายุแล้ว' }, { status: 410 })
    }

    // ตรวจว่าเป็นเจ้าของลิงก์ถูกต้อง
    // onBehalf = "คนเซ็น ≠ ชื่อบนใบ" — กฎเดียวครอบทั้งคนนอก (ไม่มีบัญชีให้เป็นเจ้าของ)
    // และสมาชิกที่ให้คนอื่นเซ็นแทนในโหมด flexible · ทุกโหมดบันทึกเสมอ ไม่ขึ้นบนเอกสาร
    let onBehalf = false
    if (role === 'recipient') {
      // ยังไม่ระบุผู้รับ = ไม่มีใครเซ็นได้ ไม่ว่าโหมดไหน (โหมด flexible ไม่ควรกลายเป็น
      // "ใครก็เซ็นใบเปล่าได้" — ใบที่ไม่มีชื่อผู้รับพิมพ์ออกมาก็ใช้ไม่ได้อยู่แล้ว)
      if (!entry.member_user_id && !entry.external_payee_id) {
        return Response.json({ error: 'ใบนี้ยังไม่ได้ระบุผู้รับเงิน' }, { status: 409 })
      }
      onBehalf = entry.member_user_id !== session.user.userId
      if (onBehalf && !entry.external_payee_id) {
        // ผู้รับเป็นสมาชิก แต่คนเซ็นไม่ใช่เจ้าตัว → ผ่านได้เฉพาะ org ที่เปิดโหมดยืดหยุ่นไว้
        // (คนนอกไม่ต้องถาม policy — ไม่มีบัญชีให้เทียบตั้งแต่แรก จะ strict แค่ไหนก็เทียบไม่ได้)
        const policy = await getDocsSignPolicy(entry.org_id)
        if (policy !== 'flexible') {
          return Response.json({ error: 'ลิงก์นี้ไม่ใช่ของคุณ' }, { status: 403 })
        }
      }
    } else {
      if (entry.payer_user_id !== session.user.userId) {
        return Response.json({ error: 'ลิงก์นี้ไม่ใช่ของคุณ' }, { status: 403 })
      }
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown'

    await signEntry({
      token,
      signatureBase64,
      userId: session.user.userId,
      ip,
      role,
      onBehalf,
    })

    return Response.json({ success: true })
  } catch (err) {
    if (err.message === 'token invalid or expired') {
      return Response.json({ error: 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว' }, { status: 404 })
    }
    console.error('[POST /api/docs/sign]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
