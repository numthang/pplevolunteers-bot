import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { getAccountById } from '@/db/finance/accounts.js'
import { canEditAccount, canViewAccount } from '@/lib/financeAccess.js'
import { can } from '@/lib/permissions.js'
import { getRoundById } from '@/db/finance/payouts.js'

/**
 * สิทธิ์รอบจ่าย = สิทธิ์ของ "บัญชีต้นทาง" ที่รอบผูกอยู่ (เคาะ 2026-09-13)
 * คนจ่ายแยกตามเขต/จังหวัด → canEditAccount ไล่ scope ให้แล้ว ไม่ต้องมี ACL ชุดที่สอง
 */
export async function requireSession() {
  const session = await getServerSession(authOptions)
  if (!session) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { userId, access } = await getEffectiveOrgIdentity(session)

  // ด่านสิทธิ์ของทั้งโซน — route ทุกตัวใต้ /api/finance/payouts วิ่งผ่านฟังก์ชันนี้
  // (requireRound ก็เรียกต่อจากที่นี่) → เพิ่ม route ใหม่ไม่ต้องจำมาเช็คซ้ำ
  // ⛔ สำคัญกับ /payees ที่สุด: มันค้นทะเบียนรับเงินทั้ง org (bank_code/account_no/promptpay_id)
  //    โดยไม่ผูกกับรอบไหนเลย — ถ้าไม่มีด่านนี้ สมาชิกคนไหนก็ยิงคำค้น 2 ตัวอักษรแล้วกวาดได้หมด
  if (!can('viewPayouts', access?.permissions || [])) {
    return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const orgId = await getOrgId(session)
  return { session, userId, access, orgId }
}

/**
 * โหลดรอบ + บัญชีต้นทาง แล้วเช็คสิทธิ์ในจังหวะเดียว
 *
 * @param {object} opt
 * @param {boolean} opt.write      true = ต้องมีสิทธิ์แก้บัญชี (canEditAccount)
 * @param {boolean} opt.allowPaid  ข้าม 409 ของรอบที่ปิดแล้ว **เฉพาะคำสั่งที่ไม่แตะตัวเงิน**
 *   ใช้ที่เดียวตอนนี้: ปุ่มแจ้ง DM ผู้รับ — รอบที่ปิดแล้วคือจังหวะที่โอนครบและต้องแจ้งพอดี
 *   ถ้าไม่มี flag นี้ ปุ่มจะตายในเคสหลัก · ⛔ ห้ามเอาไปใส่ route ที่แก้ยอด/รายชื่อ/สถานะ
 */
export async function requireRound(id, { write = true, allowPaid = false } = {}) {
  const ctx = await requireSession()
  if (ctx.error) return ctx

  const round = await getRoundById(ctx.orgId, Number(id))
  if (!round) return { error: Response.json({ error: 'Not found' }, { status: 404 }) }

  const account = await getAccountById(ctx.orgId, round.account_id)
  const ok = write ? canEditAccount(account, ctx.userId, ctx.access)
                   : canViewAccount(account, ctx.userId, ctx.access)
  if (!ok) return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }

  // รอบที่จ่ายแล้ว = ปิดบัญชีไปแล้ว ห้ามแก้ย้อนหลัง (ยอดที่โอนจริงต้องตรงกับที่บันทึกไว้)
  if (write && !allowPaid && round.status === 'paid') {
    return { error: Response.json({ error: 'Round already paid' }, { status: 409 }) }
  }

  return { ...ctx, round, account }
}
