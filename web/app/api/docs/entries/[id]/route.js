import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canAccessEvent } from '@/lib/docsAccess.js'
import { updateEntry, deleteEntry, getEntryByIdSimple, resetRecipientSignature, autoAssignPayers, reassignEntryPayer } from '@/db/docs/entries.js'
import { getPayersForEvent } from '@/db/docs/payers.js'
import { getOrgId } from '@/lib/orgContext.js'

/** PATCH /api/docs/entries/[id] — แก้ไขได้ทุกสถานะ (จำกัดด้วย scope จังหวัด) */
export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { access } = await getEffectiveIdentity(session)
  const orgId = await getOrgId(session)

  try {
    const { id } = await params
    const entry = await getEntryByIdSimple(id)
    if (!entry) return Response.json({ error: 'Not found' }, { status: 404 })
    if (!canAccessEvent(entry.province, access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const { itemType, description, amount, memberUserId: rawMemberUserId, payerUserId: rawPayerUserId } = await req.json()
    const memberUserId = rawMemberUserId ? Number(rawMemberUserId) : null
    const payerUserId  = rawPayerUserId  ? Number(rawPayerUserId)  : null
    const recipientChanged = memberUserId && memberUserId !== entry.member_user_id
    if (recipientChanged && entry.status === 'signed') {
      await resetRecipientSignature(id)
    }
    await updateEntry(id, { itemType, description, amount, memberUserId })

    if (recipientChanged) {
      if (!entry.member_user_id) {
        // เพิ่งกำหนดผู้รับให้ entry ที่เคยว่าง → resolve payer ทันที (idempotent แตะเฉพาะ payer ว่าง)
        await autoAssignPayers(entry.project_id, orgId, entry.province ?? null)
      } else if (memberUserId === entry.payer_user_id) {
        // ผู้รับใหม่ == ผู้จ่ายของ entry นี้ → สลับ payer เป็นคนถัดไปใน pool ที่ ≠ ผู้รับ
        const poolPayers = await getPayersForEvent(orgId, entry.province ?? null)
        const next = poolPayers.find(p => p.user_id && p.user_id !== memberUserId)?.user_id
        if (next) await reassignEntryPayer(id, next)
      }
    } else if (payerUserId && payerUserId !== entry.payer_user_id) {
      // เปลี่ยนผู้จ่ายตรงๆ จาก edit form dropdown
      await reassignEntryPayer(id, payerUserId)
    }
    return Response.json({ success: true, resetSignature: recipientChanged && entry.status === 'signed' })
  } catch (err) {
    console.error('[PATCH /api/docs/entries/:id]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/** DELETE /api/docs/entries/[id] — ลบได้ทุกสถานะ (จำกัดด้วย scope จังหวัด) */
export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { access } = await getEffectiveIdentity(session)
  const orgId = await getOrgId(session)

  try {
    const { id } = await params
    const entry = await getEntryByIdSimple(id)
    if (!entry) return Response.json({ error: 'Not found' }, { status: 404 })
    if (!canAccessEvent(entry.province, access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

    await deleteEntry(id)
    return Response.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/docs/entries/:id]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
