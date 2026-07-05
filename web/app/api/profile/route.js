import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { getGuildId } from '@/lib/guildContext.js'
import pool from '@/db/index.js'
import geographyData from '@/lib/thailand-geography.json'

const PROVINCE_LIST = geographyData.map(p => p.province)

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const guildId = await getGuildId(session)
  const { rows } = await pool.query(
    `SELECT nickname, firstname, lastname, member_id, specialty, amphoe, province, region,
            phone, line_id, google_id, roles, interests, username, display_name, primary_province,
            bank_name, account_no, account_holder
     FROM dc_members WHERE guild_id = $1 AND discord_id = $2`,
    [guildId, session.user.discordId]
  )

  let guild = null
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      next: { revalidate: 300 },
    })
    if (res.ok) {
      const g = await res.json()
      guild = {
        id:           g.id,
        name:         g.name,
        description:  g.description,
        icon:         g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.webp?size=64` : null,
        member_count: g.approximate_member_count ?? null,
      }
    }
  } catch {}

  const row = rows[0] || {}
  const roleProvinces = [...new Set(
    (row.roles || '').split(',')
      .map(r => {
        r = r.trim()
        if (!r.startsWith('ทีม')) return ''
        const name = r.slice(3)
        if (name.startsWith('กรุงเทพ')) return 'กรุงเทพมหานคร'
        return name
      })
      .filter(p => PROVINCE_LIST.includes(p))
  )]
  const provinceOptions = roleProvinces.length > 0 ? roleProvinces : PROVINCE_LIST

  return Response.json({ ...row, guild_id: guildId, guild, province_options: provinceOptions })
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const guildId = await getGuildId(session)
  const body = await req.json()
  const allowed = ['nickname', 'firstname', 'lastname', 'member_id', 'specialty', 'amphoe', 'phone', 'line_id', 'google_id', 'primary_province', 'bank_name', 'account_no', 'account_holder']
  const updates = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key] || null
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  // เบอร์เป็น login credential (phone OTP login) — แก้เองจาก profile = ไม่ verified อีกต่อไป
  if ('phone' in updates) updates.phone_verified_at = null

  updates.updated_at = new Date()

  const keys = Object.keys(updates)
  const values = Object.values(updates)
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
  values.push(guildId, session.user.discordId)

  await pool.query(
    `UPDATE dc_members SET ${setClause} WHERE guild_id = $${values.length - 1} AND discord_id = $${values.length}`,
    values
  )

  return Response.json({ ok: true })
}
