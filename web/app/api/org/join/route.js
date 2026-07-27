import { getOrgSession } from '@/lib/orgAuth.js'
import { redeemInviteLink } from '@/db/orgInviteLinks.js'

const REDEEM_ERRORS = {
  not_found: 'ลิงก์เชิญไม่ถูกต้อง',
  revoked:   'ลิงก์เชิญนี้ถูกปิดแล้ว',
  expired:   'ลิงก์เชิญหมดอายุแล้ว',
  full:      'ลิงก์เชิญนี้ถูกใช้ครบจำนวนแล้ว',
}

// POST /api/org/join { token } — เข้าร่วม org ด้วย invite link (ต้อง login ก่อน)
export async function POST(req) {
  const session = await getOrgSession()
  const userId = session?.user?.userId
  if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { token } = await req.json().catch(() => ({}))
  if (!token) return Response.json({ error: 'ไม่พบ token' }, { status: 400 })

  try {
    const result = await redeemInviteLink(token, userId)
    return Response.json({ ok: true, ...result })
  } catch (err) {
    const msg = REDEEM_ERRORS[err.code]
    if (msg) return Response.json({ error: msg }, { status: 400 })
    console.error('[org/join] redeem ล้มเหลว:', err)
    return Response.json({ error: 'เกิดข้อผิดพลาด — ลองใหม่อีกครั้ง' }, { status: 500 })
  }
}
