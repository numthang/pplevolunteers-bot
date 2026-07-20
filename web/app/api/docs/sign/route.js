import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEntryByToken, signEntry } from '@/db/docs/entries.js'

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
    if (role === 'recipient') {
      if (entry.member_user_id !== session.user.userId) {
        return Response.json({ error: 'ลิงก์นี้ไม่ใช่ของคุณ' }, { status: 403 })
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
