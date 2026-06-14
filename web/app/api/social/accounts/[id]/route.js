import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isAdmin } from '@/lib/roles.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import pool from '@/db/index.js'

export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })
  const { access } = await getEffectiveIdentity(session)
  if (!isAdmin(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { name, visibility, group_name } = body

  const fields = []
  const values = []
  if (name !== undefined)       { values.push(name);              fields.push(`name = $${values.length}`) }
  if (visibility !== undefined) { values.push(visibility);        fields.push(`visibility = $${values.length}`) }
  if (group_name !== undefined) { values.push(group_name || null); fields.push(`group_name = $${values.length}`) }
  if (!fields.length) return Response.json({ error: 'nothing to update' }, { status: 400 })

  values.push(id)
  await pool.query(`UPDATE dc_social_accounts SET ${fields.join(', ')} WHERE id = $${values.length}`, values)

  return Response.json({ ok: true })
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  const { access } = await getEffectiveIdentity(session)
  if (!isAdmin(access)) {
    const { rows } = await pool.query(
      `SELECT user_discord_id FROM dc_social_accounts WHERE id = $1`, [id]
    )
    if (!rows.length || rows[0].user_discord_id !== session.user.discordId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  await pool.query(`DELETE FROM dc_social_accounts WHERE id = $1`, [id])
  return Response.json({ ok: true })
}
