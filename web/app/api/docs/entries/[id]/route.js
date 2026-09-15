import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canAccessEvent } from '@/lib/docsAccess.js'
import { updateEntry, deleteEntry, getEntryByIdSimple, resetRecipientSignature, autoAssignPayers, reassignEntryPayer } from '@/db/docs/entries.js'
import { getPayersForEvent } from '@/db/docs/payers.js'
import { getOrgId } from '@/lib/orgContext.js'
import { logAction } from '@/db/auditLog.js'

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

    const { itemType, description, amount, memberUserId: rawMemberUserId,
            externalPayeeId: rawExternalPayeeId, payerUserId: rawPayerUserId, overrideData } = await req.json()
    const memberUserId    = rawMemberUserId    ? Number(rawMemberUserId)    : null
    const externalPayeeId = rawExternalPayeeId ? Number(rawExternalPayeeId) : null
    const payerUserId     = rawPayerUserId     ? Number(rawPayerUserId)     : null

    // ผู้รับเป็นได้ 2 ชนิด — ต้องเทียบทั้งคู่ ไม่ใช่ดูแค่ memberUserId
    // (ถ้าดูแค่ตัวเดียว การตั้งผู้รับเป็นคนนอกจะนับว่า "ไม่เปลี่ยน" → ไม่ได้ payer อัตโนมัติ = ใบไม่มีผู้จ่ายเงิน)
    const recipient = memberUserId    ? { kind: 'member',   id: memberUserId }
                    : externalPayeeId ? { kind: 'external', id: externalPayeeId }
                    : undefined
    const hadRecipient     = !!(entry.member_user_id || entry.external_payee_id)
    const recipientChanged = !!recipient && (
      recipient.kind === 'member'
        ? memberUserId    !== entry.member_user_id
        : externalPayeeId !== entry.external_payee_id
    )
    // เนื้อหาบน PDF (item_type/description/amount/ระยะทาง) แก้หลังเซ็นได้ **โดยไม่ต้องเซ็นใหม่** (user เคาะ 2026-09-15:
    // เอกสารจุกจิก ตามคนมาเซ็นซ้ำไม่ไหว) → ชดเชยด้วย audit log ค่าก่อน/หลัง ให้ตรวจย้อนได้ว่าแก้อะไรหลังเซ็น
    // ส่วนเปลี่ยนผู้รับยัง reset เหมือนเดิม — ลายเซ็นเดิมเป็นของอีกคน ไม่ใช่แค่รายละเอียดเปลี่ยน
    const changes = {}
    if (itemType !== undefined && itemType !== entry.item_type) changes.item_type = [entry.item_type, itemType]
    if (description !== undefined && (description || null) !== (entry.description || null)) changes.description = [entry.description || null, description || null]
    if (amount !== undefined && Number(amount) !== Number(entry.amount)) changes.amount = [Number(entry.amount), Number(amount)]
    const oldKm = entry.override_data?.distance_km ?? null
    if (overrideData?.distance_km !== undefined && overrideData.distance_km !== oldKm) changes.distance_km = [oldKm, overrideData.distance_km]
    const isSigned    = entry.status === 'signed'
    const needsResign = recipientChanged && isSigned
    if (needsResign) {
      await resetRecipientSignature(id)
    } else if (isSigned && Object.keys(changes).length) {
      await logAction({
        orgId:    entry.org_id,
        app:      'docs',
        action:   'entry.edit_after_sign',
        actorId:  session.user.userId,
        targetId: String(id),
        meta:     { signed_at: entry.signed_at ?? null, changes },
      })
    }
    await updateEntry(id, { itemType, description, amount,
      ...(recipient !== undefined ? { recipient } : {}),
      ...(overrideData !== undefined ? { overrideData } : {}) })

    if (recipientChanged) {
      if (!hadRecipient) {
        // เพิ่งกำหนดผู้รับให้ entry ที่เคยว่าง → resolve payer ทันที (idempotent แตะเฉพาะ payer ว่าง)
        await autoAssignPayers(entry.project_id, orgId, entry.province ?? null)
      } else if (memberUserId && memberUserId === entry.payer_user_id) {
        // ผู้รับใหม่ == ผู้จ่ายของ entry นี้ → สลับ payer เป็นคนถัดไปใน pool ที่ ≠ ผู้รับ
        const poolPayers = await getPayersForEvent(orgId, entry.province ?? null)
        const next = poolPayers.find(p => p.user_id && p.user_id !== memberUserId)?.user_id
        if (next) await reassignEntryPayer(id, next)
      }
    } else if (payerUserId && payerUserId !== entry.payer_user_id) {
      // เปลี่ยนผู้จ่ายตรงๆ จาก edit form dropdown
      await reassignEntryPayer(id, payerUserId)
    }
    return Response.json({ success: true, resetSignature: needsResign })
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
