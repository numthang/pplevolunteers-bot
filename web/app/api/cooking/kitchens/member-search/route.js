import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getGuildId } from '@/lib/guildContext.js'
import pool from '@/db/index.js'

// ค้นสมาชิกในกิลด์ด้วยชื่อ — ใช้แค่ตอนเชิญเข้าครัว (autocomplete แทนให้ก็อป Discord ID เอง)
// อ่านอย่างเดียว ไม่แตะ permission/role logic ของ org — แค่ login ก็ค้นได้ (บาร์เดียวกับที่แก้ครัวต้อง login)
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  if (!q) return Response.json({ members: [] })

  const guildId = await getGuildId(session)
  const { rows } = await pool.query(
    `SELECT u.discord_id, om.display_name, u.username
     FROM org_members om
     JOIN users u ON u.id = om.user_id
     WHERE om.guild_id = $1 AND (om.display_name ILIKE $2 OR u.username ILIKE $2)
     ORDER BY om.display_name LIMIT 10`,
    [guildId, `%${q}%`]
  )
  return Response.json({ members: rows })
}
