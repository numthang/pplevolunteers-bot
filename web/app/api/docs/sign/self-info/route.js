import { getServerSession } from 'next-auth'
import pool from '@/db/index.js'
import { authOptions } from '@/lib/auth-options.js'
import { getEntryByToken } from '@/db/docs/entries.js'

/**
 * Self-fill ข้อมูลผู้รับเงินที่ไม่มีใน cache_pple_member (จังหวัดอื่นนอก roster)
 * - ชื่อ-นามสกุล → users (PDF ใช้ fallback ngs_first_name ?? firstname อยู่แล้ว)
 * - เลขบัตร + ที่อยู่ → override_data ของ entry (override ชนะ ngs ทุก field ใน buildData)
 * - จำทั้งชุดใน user_config key docs_self_info → prefill ครั้งถัดไป
 * หลักฐานตัวตนจริง = สำเนาบัตรที่อัปโหลด + ลายเซ็น (เหมือน flow เดิม link-ngs เป็นแค่ pre-check)
 */

const FIELDS = ['idNumber', 'houseNo', 'moo', 'road', 'subdistrict', 'district', 'provinceAddr', 'phone']

async function loadRecipientEntry(req, tokenFromBody) {
  const session = await getServerSession(authOptions)
  // ตัวตนคือ users.id ไม่ใช่ discord_id — คนล็อกอินด้วยอีเมลก็เป็นเจ้าของใบได้
  // (เดิมบังคับ discordId → email-only user โดน 401 ทั้งที่ใบออกให้เขา)
  if (!session?.user?.userId) return { error: Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } }) }

  const token = tokenFromBody ?? new URL(req.url).searchParams.get('token')
  if (!token) return { error: Response.json({ error: 'token required' }, { status: 400, headers: { 'Cache-Control': 'no-store' } }) }

  const entry = await getEntryByToken(token)
  if (!entry) return { error: Response.json({ error: 'ลิงก์ไม่ถูกต้อง' }, { status: 404, headers: { 'Cache-Control': 'no-store' } }) }
  // member_user_id เป็น NULL ได้ (ใบที่ยังไม่ระบุผู้รับ) → เทียบไม่ติด = 403 ตามเดิม
  if (entry.signer_role !== 'recipient' || session.user.userId !== entry.member_user_id) {
    return { error: Response.json({ error: 'เฉพาะผู้รับเงินของเอกสารนี้เท่านั้น' }, { status: 403, headers: { 'Cache-Control': 'no-store' } }) }
  }
  return { entry, userId: session.user.userId }
}

/** GET /api/docs/sign/self-info?token= — ค่า prefill (ของเดิมใน entry > ที่เคยกรอกครั้งก่อน > users) */
export async function GET(req) {
  const { entry, userId, error } = await loadRecipientEntry(req)
  if (error) return error

  const { rows } = await pool.query(
    `SELECT value FROM user_config WHERE user_id = $1 AND "key" = 'docs_self_info'`,
    [userId]
  )
  const saved = rows[0]?.value || {}
  const ov = entry.override_data || {}

  // ลำดับ: ของเดิมบนใบ > ที่เคยกรอกครั้งก่อน > **ทะเบียนสมาชิก** > ว่าง
  // ชั้นทะเบียนสำคัญ — คนที่ผูกทะเบียนแล้วก็เปิดฟอร์มนี้ได้ (ตั้งแต่ 2026-08-26)
  // ถ้าไม่เติมให้ ฟอร์มจะเปิดมาว่างแล้วกดบันทึกทับข้อมูลดีๆ ที่มาจากทะเบียนหาย
  // (generatePdf ใช้ `override.x ?? ngs.x` — ค่าว่างชนะทะเบียน)
  const pick = (...v) => v.find(x => x != null && x !== '') ?? ''
  return Response.json({
    success: true,
    data: {
      firstName:    pick(entry.firstname, saved.firstName, entry.ngs_first_name),
      lastName:     pick(entry.lastname, saved.lastName, entry.ngs_last_name),
      idNumber:     pick(ov.id_number, saved.idNumber, entry.identification_number),
      houseNo:      pick(ov.house_no, saved.houseNo, entry.home_house_number),
      moo:          pick(ov.moo, saved.moo, entry.home_alley),
      road:         pick(ov.road, saved.road, entry.home_road),
      subdistrict:  pick(ov.subdistrict, saved.subdistrict, entry.home_district),
      district:     pick(ov.district, saved.district, entry.home_amphure),
      provinceAddr: pick(ov.province_addr, saved.provinceAddr, entry.home_province),
      phone:        pick(ov.phone, saved.phone, entry.mobile_number),
    },
  })
}

/** POST /api/docs/sign/self-info — บันทึกข้อมูลที่กรอกเอง */
export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const { entry, userId, error } = await loadRecipientEntry(req, body.token)
  if (error) return error

  const firstName = String(body.firstName ?? '').trim().slice(0, 100)
  const lastName  = String(body.lastName ?? '').trim().slice(0, 100)
  if (!firstName || !lastName) {
    return Response.json({ error: 'กรุณากรอกชื่อและนามสกุล' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
  const idNumber = String(body.idNumber ?? '').replace(/\D/g, '')
  if (idNumber.length !== 13) {
    return Response.json({ error: 'กรุณากรอกเลขบัตรประชาชน 13 หลัก' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  const clean = {}
  for (const f of FIELDS) clean[f] = String(body[f] ?? '').trim().slice(0, 120)
  clean.idNumber = idNumber

  try {
    // ชื่อจริง → users (identity, ใช้ซ้ำทุกเอกสาร ไม่ผูก guild)
    const phone = String(body.phone ?? '').trim().slice(0, 30)
    const { rowCount } = await pool.query(
      `UPDATE users SET firstname = $1, lastname = $2, phone = $3 WHERE id = $4`,
      [firstName, lastName, phone || null, userId]
    )
    if (rowCount === 0) return Response.json({ error: 'ไม่พบข้อมูลสมาชิก' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })

    // เลขบัตร + ที่อยู่ → override_data ของ entry (merge ไม่ทับ key อื่น)
    await pool.query(
      `UPDATE docs_activity_entries
          SET override_data = COALESCE(override_data, '{}'::jsonb) || $2::jsonb
        WHERE id = $1`,
      [entry.id, JSON.stringify({
        id_number:     clean.idNumber,
        house_no:      clean.houseNo,
        moo:           clean.moo,
        road:          clean.road,
        subdistrict:   clean.subdistrict,
        district:      clean.district,
        province_addr: clean.provinceAddr,
        phone:         clean.phone || null,
      })]
    )

    // จำไว้ prefill ครั้งหน้า
    await pool.query(
      `INSERT INTO user_config (user_id, "key", value) VALUES ($1, 'docs_self_info', $2)
       ON CONFLICT (user_id, "key") DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [userId, JSON.stringify({ firstName, lastName, ...clean })]
    )

    return Response.json({ success: true })
  } catch (err) {
    console.error('[POST /api/docs/sign/self-info]', err)
    return Response.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
