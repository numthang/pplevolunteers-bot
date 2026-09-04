import { getServerSession } from 'next-auth'
import pool from '@/db/index.js'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs, canAccessEvent } from '@/lib/docsAccess.js'
import { getEntryByIdSimple } from '@/db/docs/entries.js'
import { getDocsSignPolicy } from '@/db/orgConfig.js'
import { isValidThaiId, digitsOnly } from '@/lib/thaiId.js'

/**
 * PUT /api/docs/entries/[id]/recipient-info
 * ผู้ดูแลกรอกข้อมูลผู้รับเงิน (สมาชิก) แทนเจ้าตัว — สำหรับคนที่ยังไม่ผูกทะเบียนสมาชิก
 * หรือไม่มีอยู่ในทะเบียนเลย (จังหวัดนอก roster)
 *
 * ปลายทางเดียวกับที่เจ้าตัวกรอกเองผ่าน /api/docs/sign/self-info เป๊ะ — ต่างแค่ใครกด:
 *   ชื่อ-สกุล + เบอร์  → users ของผู้รับ
 *   เลขบัตร + ที่อยู่  → override_data ของ entry (ชนะทุกแหล่งใน buildData)
 *   ทั้งชุด           → user_config docs_self_info ของผู้รับ → ใบหน้าเติมให้เอง
 *
 * ⚠️ เขียนลงบัญชี "ผู้รับ" ไม่ใช่บัญชีคนที่ล็อกอิน — ตรงนี้คือจุดที่ self-info เดิมทำไม่ได้
 * ⚠️ เปิดเฉพาะ org ที่ตั้งโหมดยืดหยุ่น (ผู้ดูแลทำแทนสมาชิกได้ ทั้งกรอกและเซ็น)
 */
export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const entry = await getEntryByIdSimple(id)
  if (!entry) return Response.json({ error: 'Not found' }, { status: 404 })
  if (!canAccessEvent(entry.province, access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  if (!entry.member_user_id) {
    // คนนอกมีฟอร์มของตัวเองที่ /api/docs/external-payees/[id] — ไม่ให้ปนเส้นกัน
    return Response.json({ error: 'ใบนี้ผู้รับไม่ใช่สมาชิก' }, { status: 409 })
  }
  // flexible กับ open ต้องไปด้วยกันเสมอ (open หลวมกว่า) — ไม่งั้นผู้ดูแลกรอกข้อมูลแทนไม่ได้
  // ในโหมด open ทั้งที่เป็นโหมดที่ต้องพึ่งผู้ดูแลกรอกให้มากที่สุด (คนถือลิงก์กรอกเองไม่ได้)
  const policy = await getDocsSignPolicy(entry.org_id)
  if (policy !== 'flexible' && policy !== 'open') {
    return Response.json({ error: 'องค์กรนี้ตั้งให้สมาชิกกรอกข้อมูลเอง — เปลี่ยนได้ที่ ตั้งค่าเอกสาร' }, { status: 403 })
  }

  const b = await req.json().catch(() => ({}))
  const str = (v, n = 120) => String(v ?? '').trim().slice(0, n)
  const firstName = str(b.first_name, 100)
  const lastName  = str(b.last_name, 100)
  if (!firstName || !lastName) return Response.json({ error: 'กรุณากรอกชื่อและนามสกุล' }, { status: 400 })

  const idNumber = digitsOnly(b.id_number)
  if (idNumber && !isValidThaiId(idNumber)) {
    return Response.json({ error: 'เลขบัตรประชาชน 13 หลักไม่ถูกต้อง' }, { status: 400 })
  }

  const addr = {
    id_number:     idNumber || null,
    house_no:      str(b.house_no),
    moo:           str(b.moo, 20),
    road:          str(b.road),
    subdistrict:   str(b.subdistrict),
    district:      str(b.district),
    province_addr: str(b.province),
    phone:         str(b.phone, 30) || null,
  }
  const title = str(b.title, 20)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE users SET firstname = $1, lastname = $2, phone = COALESCE($3, phone) WHERE id = $4`,
      [firstName, lastName, addr.phone, entry.member_user_id]
    )
    await client.query(
      `UPDATE docs_activity_entries
          SET override_data = COALESCE(override_data, '{}'::jsonb) || $2::jsonb
        WHERE id = $1`,
      // full_name/last_name ต้องลง override ด้วย — ผู้รับไม่ได้ผูกทะเบียน ชื่อบนใบจึงมาจากที่นี่
      // เก็บ `title` แยกไว้ด้วย — full_name ต่อคำนำหน้าติดชื่อไปแล้วแยกกลับไม่ได้
      // ไม่เก็บ = เปิดฟอร์มแก้รอบหน้าคำนำหน้าหาย แล้วเซฟทับ ชื่อบนใบเหลือแต่ชื่อตัว (bug-453)
      [entry.id, JSON.stringify({ ...addr, title: title || null, full_name: (title ? title + firstName : firstName), last_name: lastName })]
    )
    await client.query(
      `INSERT INTO user_config (user_id, "key", value) VALUES ($1, 'docs_self_info', $2)
       ON CONFLICT (user_id, "key") DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      // ⭐ ตั้งแต่ 2026-08-30 ก้อนนี้คือ "ตัวตนระดับคน" ที่ view docs_entry_recipient อ่านจริง
      // (ชั้นเหนือ cache_pple_member) ใบใหม่ของคนนี้จึงไม่ต้องกรอกซ้ำอีก — title ต้องมีด้วย
      // ไม่งั้นใบถัดไปได้ที่อยู่ครบแต่คำนำหน้าหาย เพราะ title เดิมลงแค่ override_data ต่อใบ
      [entry.member_user_id, JSON.stringify({
        title, firstName, lastName, idNumber: addr.id_number ?? '', houseNo: addr.house_no, moo: addr.moo,
        road: addr.road, subdistrict: addr.subdistrict, district: addr.district,
        provinceAddr: addr.province_addr, phone: addr.phone ?? '',
      })]
    )
    await client.query('COMMIT')
    return Response.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[PUT /api/docs/entries/:id/recipient-info]', err)
    return Response.json({ error: 'บันทึกไม่สำเร็จ' }, { status: 500 })
  } finally {
    client.release()
  }
}
