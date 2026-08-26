import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs, canAccessEvent } from '@/lib/docsAccess.js'
import { getEntryByToken } from '@/db/docs/entries.js'
import { getDocsSignPolicy } from '@/db/orgConfig.js'

/**
 * GET /api/docs/sign/verify?token=
 * Load entry info for the signing page (no ownership check — just checks expiry)
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')

  if (!token) {
    return Response.json({ error: 'token required' }, { status: 400 })
  }

  try {
    const entry = await getEntryByToken(token)

    if (!entry) {
      return Response.json({ error: 'ลิงก์ไม่ถูกต้อง' }, { status: 404 })
    }

    if (entry.signer_token_expires_at && new Date(entry.signer_token_expires_at) < new Date()) {
      return Response.json({ error: 'ลิงก์หมดอายุแล้ว' }, { status: 410 })
    }

    const role = entry.signer_role  // 'recipient' | 'payer'
    const isExternal = !!entry.external_payee_id
    // หน้าเซ็นต้องรู้ policy เพื่อเตือนก่อนเซ็นว่า "กำลังเซ็นแทนคนอื่น" — จับพลาดก่อนเซ็น
    // ดีกว่าไปเจอใน signed_on_behalf ทีหลังซึ่งสายไปแล้ว
    const signPolicy = await getDocsSignPolicy(entry.org_id)
    // คนที่เปิดลิงก์นี้เป็นผู้ดูแลเอกสารของใบนี้ไหม — หน้าเซ็นใช้ตัดสินว่าโชว์การ์ดสำเนาบัตร
    // ให้จัดการแทนสมาชิกได้หรือเปล่า **ห้ามโชว์ให้ทุกคน**: โหมดยืดหยุ่น = สมาชิกคนไหนเปิดลิงก์ก็ได้
    // ถ้าโชว์หมด = เอาบัตร ปชช. คนอื่นไปแปะให้ดู (PDPA)
    // เช็คด้วยกฎเดียวกับ gate() ของ POST /api/docs/entries/:id/id-card เป๊ะ ไม่งั้นหน้าโชว์ปุ่มแล้วโดน 403
    let canManage = false
    try {
      const session = await getServerSession(authOptions)
      if (session?.user?.userId) {
        const { access } = await getEffectiveIdentity(session)
        canManage = canManageDocs(access) && canAccessEvent(entry.province, access)
      }
    } catch {
      // ลิงก์เซ็นเปิดได้โดยไม่ต้องเป็นคนใน org — resolve สิทธิ์ไม่ได้ = ไม่ใช่ผู้ดูแล ไม่ใช่ error
    }
    // ข้อมูลบนใบครบพอจะพิมพ์ไหม — เช็คแบบเดียวกับที่ buildData() เลือกค่า (override ชนะ ทะเบียน/คนนอก)
    // ใช้ตัดสินว่าต้องขึ้นการ์ด "กรอกข้อมูลผู้รับ" ให้ผู้ดูแลก่อนเซ็นหรือยัง
    const ov = entry.override_data || {}
    const recipientComplete = !!(
      (ov.full_name     || entry.ngs_first_name        || entry.firstname) &&
      (ov.id_number     || entry.identification_number) &&
      (ov.province_addr || entry.home_province)
    )

    return Response.json({
      success: true,
      data: {
        id:               entry.id,
        status:           entry.status,
        item_type:        entry.item_type,
        description:      entry.description,
        amount:           entry.amount,
        event_name:       entry.event_name,
        event_date:       entry.event_date,
        event_end_date:   entry.event_end_date,
        display_name:     entry.display_name,
        ngs_first_name:   entry.ngs_first_name ?? null,
        ngs_last_name:    entry.ngs_last_name ?? null,
        member_discord_id: entry.member_discord_id,
        token_expires_at: entry.signer_token_expires_at,
        signer_role:      role,
        // recipient-only fields
        member_user_id:    role === 'recipient' ? entry.member_user_id    : null,
        external_payee_id: role === 'recipient' ? entry.external_payee_id : null,
        recipient_kind:    role === 'recipient' ? entry.recipient_kind    : null,
        sign_policy:       signPolicy,
        can_manage:        canManage,
        recipient_complete: role === 'recipient' ? recipientComplete : null,
        // คนนอกไม่มีทะเบียนสมาชิกให้ผูก และไม่มีบัญชีให้ self-fill — ข้อมูลครบอยู่ในแถวของเขาเองแล้ว
        // ถ้าไม่ตอบ true สองตัวนี้ หน้าเซ็นจะค้างที่ขั้น "ผูกรายชื่อสมาชิก" ซึ่งคนนอกผ่านไม่ได้
        has_ngs_link:     role === 'recipient' ? (isExternal || !!entry.member_id) : null,
        // self-fill ครบ (ชื่อใน users + เลขบัตรใน override_data) = ยืนยันตัวตนแบบกรอกเองแล้ว
        has_self_info:    role === 'recipient' ? (isExternal || !!(entry.firstname && entry.lastname && entry.override_data?.id_number)) : null,
        has_id_card:      role === 'recipient' ? !!entry.has_id_card : null,
        // payer status
        payer_signed_at:  entry.payer_signed_at ?? null,
      },
    })
  } catch (err) {
    console.error('[GET /api/docs/sign/verify]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
