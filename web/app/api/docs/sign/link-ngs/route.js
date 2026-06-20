import { getServerSession } from 'next-auth'
import pool from '@/db/index.js'
import { authOptions } from '@/lib/auth-options.js'
import { getEntryByToken } from '@/db/docs/entries.js'

const digits = (s) => String(s ?? '').replace(/\D/g, '')

/**
 * POST /api/docs/sign/link-ngs
 * Body: { token, ngsSourceId, idNumber }
 * ผูก dc_members.member_id ของ user (login) กับ ngs_member_cache.source_id
 * — ต้องยืนยันเลขบัตร 13 หลักให้ตรงกับ record ที่เลือก เพื่อกันการแอบอ้างเป็นคนอื่น
 */
export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { token, ngsSourceId, idNumber } = await req.json()
  if (!token || !ngsSourceId) return Response.json({ error: 'token and ngsSourceId required' }, { status: 400 })

  const idDigits = digits(idNumber)
  if (idDigits.length !== 13) return Response.json({ error: 'กรุณากรอกเลขบัตรประชาชน 13 หลัก' }, { status: 400 })

  const entry = await getEntryByToken(token)
  if (!entry) return Response.json({ error: 'ลิงก์ไม่ถูกต้อง' }, { status: 404 })

  // ยืนยันตัวตน: เลขบัตรที่กรอกต้องตรงกับ record ที่เลือก (ใน guild เดียวกัน)
  const { rows } = await pool.query(
    `SELECT identification_number FROM ngs_member_cache WHERE source_id = $1 AND guild_id = $2`,
    [ngsSourceId, entry.guild_id]
  )
  if (!rows[0]) return Response.json({ error: 'ไม่พบข้อมูลในระบบสมาชิก' }, { status: 404 })

  const recordId = digits(rows[0].identification_number)
  if (!recordId) return Response.json({ error: 'ระบบไม่มีเลขบัตรของรายชื่อนี้ — ติดต่อแอดมิน' }, { status: 422 })
  if (recordId !== idDigits) return Response.json({ error: 'เลขบัตรไม่ตรงกับรายชื่อที่เลือก' }, { status: 403 })

  try {
    const { rowCount } = await pool.query(
      `UPDATE dc_members SET member_id = $1 WHERE discord_id = $2 AND guild_id = $3`,
      [ngsSourceId, session.user.discordId, entry.guild_id]
    )
    if (rowCount === 0) return Response.json({ error: 'ไม่พบข้อมูลสมาชิก' }, { status: 404 })
    return Response.json({ success: true })
  } catch (err) {
    // unique (guild_id, member_id) — รายชื่อนี้ถูกผูกกับบัญชีอื่นไปแล้ว
    if (err.code === '23505') {
      return Response.json({ error: 'รายชื่อนี้ถูกผูกกับบัญชีอื่นแล้ว — ติดต่อแอดมิน' }, { status: 409 })
    }
    console.error('[POST /api/docs/sign/link-ngs]', err)
    return Response.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
