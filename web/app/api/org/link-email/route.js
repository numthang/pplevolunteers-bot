import { consumeBindToken } from '@/lib/emailBindLink.js'
import { logAction } from '@/db/auditLog.js'

const ERR = {
  invalid: 'ลิงก์ไม่ถูกต้องหรือถูกใช้ไปแล้ว',
  expired: 'ลิงก์หมดอายุแล้ว — ขอลิงก์ใหม่จากแอดมิน',
  already_taken: 'อีเมลนี้ถูกใช้กับบัญชีอื่นแล้ว',
}

// POST /api/org/link-email — สมาชิกกดลิงก์จากอีเมลเพื่อยืนยันว่าเข้าถึง inbox นี้ได้จริง
// เขียน users.email ที่นี่ที่เดียว (ไม่ใช่ตอน owner ขอลิงก์)
export async function POST(req) {
  const { token } = await req.json().catch(() => ({}))
  if (!token) return Response.json({ error: ERR.invalid }, { status: 400 })

  const res = await consumeBindToken(token)
  if (res.error) return Response.json({ error: ERR[res.error] || res.error }, { status: 400 })

  if (res.orgId) {
    logAction({
      orgId: res.orgId, app: 'org', action: 'identity_email_bind_complete',
      actorId: res.actorUserId, targetId: `u${res.userId}`, meta: { email: res.email },
    })
  }
  return Response.json({ ok: true })
}
