import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs, canAccessEvent } from '@/lib/docsAccess.js'
import { getEntryByIdSimple, resetRecipientSignature } from '@/db/docs/entries.js'
import { logAction } from '@/db/auditLog.js'

/**
 * POST /api/docs/entries/[id]/unlock-signature
 * ปลดล็อกลายเซ็นผู้รับ — ลบลายเซ็นเดิมทิ้งแล้วให้เซ็นใหม่ผ่านลิงก์เดิมได้
 *
 * มีไว้เพื่ออะไร: โหมด `open` ล็อกใบที่เซ็นผ่านลิงก์แล้วไม่ให้เซ็นทับ (signEntry) — ไม่งั้นใครที่
 * ได้ลิงก์ต่อทับลายเซ็นเดิมได้ตลอดกาลโดยไม่มีร่องรอยว่าใคร · แต่คนเซ็นพลาดจริงก็มี (ลายมือเบี้ยว
 * เซ็นผิดช่อง) ถ้าไม่มีทางปลด = ต้องลบใบทิ้งสร้างใหม่ ซึ่งเปลี่ยน sign_token = ต้องส่งลิงก์ใหม่ทั้งชุด
 *
 * ⚠️ เป็นการ **ลบหลักฐาน** — จำกัดที่ผู้ดูแลเอกสารในเขตของงานนั้น และเขียน audit log เสมอ
 *    (กฎเดียวกับ gate() ของ id-card: canManageDocs + canAccessEvent)
 */
export async function POST(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const entry = await getEntryByIdSimple(id)
    if (!entry) return Response.json({ error: 'Not found' }, { status: 404 })

    const { access } = await getEffectiveIdentity(session)
    if (!canManageDocs(access) || !canAccessEvent(entry.province, access)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    await resetRecipientSignature(id)
    await logAction({
      orgId:    entry.org_id,
      app:      'docs',
      action:   'signature.unlock',
      actorId:  session.user.userId,
      targetId: String(id),
      // เก็บสถานะก่อนปลดไว้ด้วย — หลังลบลายเซ็นแล้วไม่มีทางรู้ย้อนหลังว่าใบนี้เคยเซ็นถึงขั้นไหน
      meta:     { previous_status: entry.status, previous_signed_at: entry.signed_at ?? null },
    })

    return Response.json({ success: true })
  } catch (err) {
    console.error('[POST /api/docs/entries/:id/unlock-signature]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
