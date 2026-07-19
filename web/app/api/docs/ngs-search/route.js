import { getServerSession } from 'next-auth'
import pool from '@/db/index.js'
import { authOptions } from '@/lib/auth-options.js'
import { getEntryByToken } from '@/db/docs/entries.js'

/**
 * GET /api/docs/ngs-search?token=&q=
 * Search cache_pple_member by name, scoped to the guild from the sign token.
 * Used on sign page for self-link when member_id not yet set.
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  const q     = searchParams.get('q') || ''

  if (!token) return Response.json({ error: 'token required' }, { status: 400 })
  if (q.trim().length < 2) return Response.json({ success: true, data: [] })

  const entry = await getEntryByToken(token)
  if (!entry) return Response.json({ error: 'ลิงก์ไม่ถูกต้อง' }, { status: 404 })

  // ไม่ส่ง identification_number กลับ client — เป็น PII และต้องใช้ยืนยันตัวตนตอน link
  // (ถ้ารั่วออกไป การ verify เลขบัตรตอน link จะไร้ความหมาย)
  const params = [entry.guild_id, `%${q}%`]
  const { rows } = await pool.query(
    `SELECT source_id, first_name, last_name,
            (identification_number IS NOT NULL AND identification_number <> '') AS has_id_number
     FROM cache_pple_member
     WHERE guild_id = $1
       AND (first_name ILIKE $2 OR last_name ILIKE $2
            OR CONCAT(first_name, ' ', last_name) ILIKE $2)
     ORDER BY first_name, last_name
     LIMIT 20`,
    params
  )

  return Response.json({ success: true, data: rows })
}
