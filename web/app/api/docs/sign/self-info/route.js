import { getServerSession } from 'next-auth'
import pool from '@/db/index.js'
import { authOptions } from '@/lib/auth-options.js'
import { getEntryByToken } from '@/db/docs/entries.js'

/**
 * Self-fill ข้อมูลผู้รับเงินที่ไม่มีใน ngs_member_cache (จังหวัดอื่นนอก roster)
 * - ชื่อ-นามสกุล → dc_members (PDF ใช้ fallback ngs_first_name ?? firstname อยู่แล้ว)
 * - เลขบัตร + ที่อยู่ → override_data ของ entry (override ชนะ ngs ทุก field ใน buildData)
 * - จำทั้งชุดใน dc_user_config key docs_self_info → prefill ครั้งถัดไป
 * หลักฐานตัวตนจริง = สำเนาบัตรที่อัปโหลด + ลายเซ็น (เหมือน flow เดิม link-ngs เป็นแค่ pre-check)
 */

const FIELDS = ['idNumber', 'houseNo', 'moo', 'road', 'subdistrict', 'district', 'provinceAddr', 'phone']

async function loadRecipientEntry(req, tokenFromBody) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }

  const token = tokenFromBody ?? new URL(req.url).searchParams.get('token')
  if (!token) return { error: Response.json({ error: 'token required' }, { status: 400 }) }

  const entry = await getEntryByToken(token)
  if (!entry) return { error: Response.json({ error: 'ลิงก์ไม่ถูกต้อง' }, { status: 404 }) }
  if (entry.signer_role !== 'recipient' || session.user.discordId !== entry.member_discord_id) {
    return { error: Response.json({ error: 'เฉพาะผู้รับเงินของเอกสารนี้เท่านั้น' }, { status: 403 }) }
  }
  return { entry, discordId: session.user.discordId }
}

/** GET /api/docs/sign/self-info?token= — ค่า prefill (ของเดิมใน entry > ที่เคยกรอกครั้งก่อน > dc_members) */
export async function GET(req) {
  const { entry, discordId, error } = await loadRecipientEntry(req)
  if (error) return error

  const { rows } = await pool.query(
    `SELECT value FROM dc_user_config WHERE discord_id = $1 AND "key" = 'docs_self_info'`,
    [discordId]
  )
  const saved = rows[0]?.value || {}
  const ov = entry.override_data || {}

  return Response.json({
    success: true,
    data: {
      firstName:    entry.firstname ?? saved.firstName ?? '',
      lastName:     entry.lastname ?? saved.lastName ?? '',
      idNumber:     ov.id_number ?? saved.idNumber ?? '',
      houseNo:      ov.house_no ?? saved.houseNo ?? '',
      moo:          ov.moo ?? saved.moo ?? '',
      road:         ov.road ?? saved.road ?? '',
      subdistrict:  ov.subdistrict ?? saved.subdistrict ?? '',
      district:     ov.district ?? saved.district ?? '',
      provinceAddr: ov.province_addr ?? saved.provinceAddr ?? '',
      phone:        ov.phone ?? saved.phone ?? '',
    },
  })
}

/** POST /api/docs/sign/self-info — บันทึกข้อมูลที่กรอกเอง */
export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const { entry, discordId, error } = await loadRecipientEntry(req, body.token)
  if (error) return error

  const firstName = String(body.firstName ?? '').trim().slice(0, 100)
  const lastName  = String(body.lastName ?? '').trim().slice(0, 100)
  if (!firstName || !lastName) {
    return Response.json({ error: 'กรุณากรอกชื่อและนามสกุล' }, { status: 400 })
  }
  const idNumber = String(body.idNumber ?? '').replace(/\D/g, '')
  if (idNumber.length !== 13) {
    return Response.json({ error: 'กรุณากรอกเลขบัตรประชาชน 13 หลัก' }, { status: 400 })
  }

  const clean = {}
  for (const f of FIELDS) clean[f] = String(body[f] ?? '').trim().slice(0, 120)
  clean.idNumber = idNumber

  try {
    // ชื่อจริง → dc_members (ใช้ซ้ำทุกเอกสาร)
    const phone = String(body.phone ?? '').trim().slice(0, 30)
    const { rowCount } = await pool.query(
      `UPDATE dc_members SET firstname = $1, lastname = $2, phone = $3 WHERE discord_id = $4 AND guild_id = $5`,
      [firstName, lastName, phone || null, discordId, entry.guild_id]
    )
    if (rowCount === 0) return Response.json({ error: 'ไม่พบข้อมูลสมาชิก' }, { status: 404 })

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
      `INSERT INTO dc_user_config (discord_id, "key", value) VALUES ($1, 'docs_self_info', $2)
       ON CONFLICT (discord_id, "key") DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [discordId, JSON.stringify({ firstName, lastName, ...clean })]
    )

    return Response.json({ success: true })
  } catch (err) {
    console.error('[POST /api/docs/sign/self-info]', err)
    return Response.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
