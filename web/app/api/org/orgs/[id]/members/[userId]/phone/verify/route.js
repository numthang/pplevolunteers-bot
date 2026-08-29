import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership } from '@/db/orgMembers.js'
import pool from '@/db/index.js'
import {
  MAX_ATTEMPTS, hashOtp, validPhone, bumpAttempt, clearBindSession, setVerifiedPhone,
} from '@/lib/phoneBindOtp.js'
import { normalizePhone } from '@/lib/sendSms.js'
import { logAction } from '@/db/auditLog.js'

// POST .../phone/verify — owner กรอกรหัสที่สมาชิกบอก (โทร/คุยสด) เพื่อยืนยันเบอร์จริง
export async function POST(req, { params }) {
  const session = await getOrgSession()
  const me = session?.user?.userId
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { id, userId } = await params
  const orgId = Number(id); const target = Number(userId)
  const membership = await getOrgMembership(orgId, me)
  if (!membership || membership.status !== 'active' || membership.role !== 'owner') {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const { rows: memberRows } = await pool.query(
    `SELECT 1 FROM org_members WHERE org_id = $1 AND user_id = $2`, [orgId, target]
  )
  if (!memberRows[0]) return Response.json({ error: 'ไม่พบสมาชิกใน org นี้' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const phone = normalizePhone(body.phone)
  const otp = String(body.otp || '').trim()
  if (!validPhone(phone) || !/^\d{6}$/.test(otp)) {
    return Response.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const fail = () => Response.json({ error: 'รหัสไม่ถูกต้องหรือหมดอายุ — ลองใหม่ หรือขอรหัสใหม่' }, { status: 400 })

  const s = await bumpAttempt(target)
  if (!s || Date.now() > s.expires_at || s.attempts > MAX_ATTEMPTS) return fail()
  if (s.phone !== phone || hashOtp(otp, target) !== s.otp_hash) return fail()

  try {
    await setVerifiedPhone(target, phone)
  } catch (err) {
    if (err.code === 'already_taken') {
      await clearBindSession(target)
      return Response.json({ error: 'เบอร์นี้ถูกยืนยันกับบัญชีอื่นแล้ว' }, { status: 409 })
    }
    return Response.json({ error: 'เกิดข้อผิดพลาด — ลองใหม่อีกครั้ง' }, { status: 500 })
  }

  await clearBindSession(target)
  logAction({
    orgId, app: 'org', action: 'identity_phone_bind',
    actorId: me, targetId: `u${target}`, meta: { phone },
  })

  return Response.json({ ok: true })
}
