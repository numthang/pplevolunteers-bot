import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs, canAccessEvent } from '@/lib/docsAccess.js'
import { getEntryByToken, getSignatureByEntryId } from '@/db/docs/entries.js'
import { getDocsSignPolicy } from '@/db/orgConfig.js'
import { getOrgEnabledFeatures } from '@/lib/orgFeatures.js'

/**
 * GET /api/docs/sign/verify?token=
 * Load entry info for the signing page (no ownership check — ด่านจริงอยู่ที่ปลายทางแต่ละเส้น)
 *
 * ลิงก์เซ็น **ไม่มีวันหมดอายุ** (เคาะ 2026-08-26) — เดิม 410 หลัง 2 เดือน แล้วใบเปิดไม่ได้อีกเลย
 * ทั้งที่เอกสารยังต้องใช้ ไม่มีปุ่มขอลิงก์ใหม่ให้ผู้รับด้วย · กันการเข้าถึงด้วย login + ownership แทน
 */
// ⚠️ ห้ามให้เบราว์เซอร์แคชคำตอบนี้ — เดิมไม่มี Cache-Control เลย พอเคยตอบ 410 (ลิงก์หมดอายุ)
// เบราว์เซอร์เก็บไว้ตาม heuristic (410 เป็นสถานะที่แคชได้เองตาม RFC 7231) แล้ว fetch() รอบหลัง
// กินของเก่าจากแคช → ต่อให้ฝั่ง server แก้แล้ว user ก็ยังเห็นจอ "ลิงก์หมดอายุแล้ว" ค้าง (เจอจริง 2026-08-26)
const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body, status = 200) => Response.json(body, { status, headers: NO_STORE })

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')

  if (!token) {
    return json({ error: 'token required' }, 400)
  }

  try {
    const entry = await getEntryByToken(token)

    if (!entry) {
      return json({ error: 'ลิงก์ไม่ถูกต้อง' }, 404)
    }

    // ด่านฟีเจอร์ของลิงก์เซ็นอยู่ตรงนี้ที่เดียว — `app/docs/layout.js` ยกเว้น /docs/sign/* จาก
    // requireFeature() ไปแล้ว (ไม่งั้นโหมด open ใช้ไม่ได้เลย: คนโดนเด้งไปล็อกอินก่อน render)
    // ⚠️ ต้องถาม org ของ **ใบ** ไม่ใช่ org ของคนเปิด — โหมด open ไม่มีคนให้ resolve org ตั้งแต่ต้น
    const enabled = await getOrgEnabledFeatures(entry.org_id)
    if (!enabled.includes('docs')) {
      return json({ error: 'ลิงก์ไม่ถูกต้อง' }, 404)   // ปิดฟีเจอร์ = ตอบเหมือน token ผิด ไม่บอกว่ามีใบอยู่จริง
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
    // เซ็นแล้วล็อกไหม — ลายเซ็นล่าสุดของ role นี้มาจากลิงก์ (โหมด open) = เซ็นทับไม่ได้
    // ต้องบอกหน้าเซ็นตั้งแต่แรก ไม่ใช่ให้วาดจนเสร็จแล้วค่อยเด้ง 409 ตอนกดส่ง
    const lastSig = await getSignatureByEntryId(entry.id, role)
    const signatureLocked = lastSig?.signed_via === 'link'

    const ov = entry.override_data || {}
    const recipientComplete = !!(
      (ov.full_name     || entry.ngs_first_name        || entry.firstname) &&
      (ov.id_number     || entry.identification_number) &&
      (ov.province_addr || entry.home_province)
    )

    return json({
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
        signer_role:      role,
        // recipient-only fields
        member_user_id:    role === 'recipient' ? entry.member_user_id    : null,
        external_payee_id: role === 'recipient' ? entry.external_payee_id : null,
        recipient_kind:    role === 'recipient' ? entry.recipient_kind    : null,
        sign_policy:       signPolicy,
        signature_locked:  signatureLocked,
        can_manage:        canManage,
        recipient_complete: role === 'recipient' ? recipientComplete : null,
        // ค่าตั้งต้นของฟอร์มแก้ไขข้อมูล (ผู้ดูแลกรอกแทน) — ต้องส่งที่อยู่จากทะเบียนไปด้วย
        // ไม่งั้นฟอร์มเปิดมาว่าง กดบันทึก = ล้างข้อมูลบนใบ (generatePdf ใช้ `override.x ?? ngs.x`)
        override_data:         role === 'recipient' ? (entry.override_data ?? null) : null,
        // ⚠️ firstname/lastname/title ต้องส่งด้วย — ไม่ใช่แค่ ngs_* · คนที่ไม่ได้ผูกทะเบียน
        // ชื่อจริงอยู่ที่ users (recipient-info/self-info เขียนลงที่นั่น) ถ้าไม่ส่งกลับมา
        // ฟอร์มจะเปิดมาชื่อว่างทุกครั้งที่ reload ทั้งที่บันทึกไปแล้ว (bug-453)
        title:                 role === 'recipient' ? (entry.title ?? null) : null,
        firstname:             role === 'recipient' ? (entry.firstname ?? null) : null,
        lastname:              role === 'recipient' ? (entry.lastname ?? null) : null,
        identification_number: role === 'recipient' ? (entry.identification_number ?? null) : null,
        home_house_number:     role === 'recipient' ? (entry.home_house_number ?? null) : null,
        home_alley:            role === 'recipient' ? (entry.home_alley ?? null) : null,
        home_road:             role === 'recipient' ? (entry.home_road ?? null) : null,
        home_district:         role === 'recipient' ? (entry.home_district ?? null) : null,
        home_amphure:          role === 'recipient' ? (entry.home_amphure ?? null) : null,
        home_province:         role === 'recipient' ? (entry.home_province ?? null) : null,
        mobile_number:         role === 'recipient' ? (entry.mobile_number ?? null) : null,
        // คนนอกไม่มีทะเบียนสมาชิกให้ผูก และไม่มีบัญชีให้ self-fill — ข้อมูลครบอยู่ในแถวของเขาเองแล้ว
        // ถ้าไม่ตอบ true สองตัวนี้ หน้าเซ็นจะค้างที่ขั้น "ผูกรายชื่อสมาชิก" ซึ่งคนนอกผ่านไม่ได้
        has_ngs_link:     role === 'recipient' ? (isExternal || !!entry.member_id) : null,
        // self-fill ครบ (ชื่อใน users + เลขบัตรใน override_data) = ยืนยันตัวตนแบบกรอกเองแล้ว
        // ⚠️ ต้องใช้ entry.identification_number (ค่าที่ view resolve แล้ว) ไม่ใช่ override_data ตรงๆ
        // override_data ผูกกับ "ใบ" ใบเดียว → ใบที่ 2 ของคนเดิมจะตอบ false ทั้งที่กรอกไปแล้ว
        // (บั๊ก 2026-08-30) · view มีชั้น user_config docs_self_info = ตัวตนระดับคน ให้แล้ว
        has_self_info:    role === 'recipient' ? (isExternal || !!(entry.firstname && entry.lastname && entry.identification_number)) : null,
        has_id_card:      role === 'recipient' ? !!entry.has_id_card : null,
        // payer status
        payer_signed_at:  entry.payer_signed_at ?? null,
      },
    })
  } catch (err) {
    console.error('[GET /api/docs/sign/verify]', err)
    return json({ error: 'Internal Server Error' }, 500)
  }
}
