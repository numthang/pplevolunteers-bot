import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isAdmin } from '@/lib/roles.js'
import pool from '@/db/index.js'

export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin(session.user.roles)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const { name, visibility } = body

  const fields = []
  const values = []
  if (name !== undefined)       { fields.push('name = ?');       values.push(name) }
  if (visibility !== undefined) { fields.push('visibility = ?'); values.push(visibility) }
  if (!fields.length) return Response.json({ error: 'nothing to update' }, { status: 400 })

  values.push(id)
  await pool.execute(`UPDATE dc_social_accounts SET ${fields.join(', ')} WHERE id = ?`, values)

  return Response.json({ ok: true })
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  if (!isAdmin(session.user.roles)) {
    const [rows] = await pool.execute(
      `SELECT user_discord_id FROM dc_social_accounts WHERE id = ?`, [id]
    )
    if (!rows.length || rows[0].user_discord_id !== session.user.discordId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  await pool.execute(`DELETE FROM dc_social_accounts WHERE id = ?`, [id])
  return Response.json({ ok: true })
}
