import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import pool from '@/db/index.js'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [rows] = await pool.query(
    `SELECT nickname, firstname, lastname, member_id, specialty, amphoe, province, region,
            phone, line_id, google_id, roles, interests, username, display_name
     FROM dc_members WHERE guild_id = ? AND discord_id = ?`,
    [process.env.GUILD_ID, session.user.discordId]
  )
  return Response.json(rows[0] || {})
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const allowed = ['nickname', 'firstname', 'lastname', 'member_id', 'specialty', 'amphoe', 'phone', 'line_id', 'google_id']
  const updates = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key] || null
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  updates.updated_at = new Date()

  await pool.query(
    'UPDATE dc_members SET ? WHERE guild_id = ? AND discord_id = ?',
    [updates, process.env.GUILD_ID, session.user.discordId]
  )

  return Response.json({ ok: true })
}
