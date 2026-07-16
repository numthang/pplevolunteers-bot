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
  // identity (firstname/lastname/phone/line_id/google_id/username) → users · ที่เหลือ → org_members
  const { rows } = await pool.query(
    `SELECT om.nickname, u.firstname, u.lastname, om.member_id, om.specialty, om.amphoe, om.province, om.region,
            u.phone, u.line_id, u.google_id, om.roles, om.interests, u.username, om.display_name, om.primary_province,
            om.bank_name, om.account_no, om.account_holder
     FROM org_members om JOIN users u ON u.id = om.user_id
     WHERE om.guild_id = $1 AND u.discord_id = $2`,
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
  const discordId = session.user.discordId
  const body = await req.json()

  // identity fields → users (by discord_id) · profile fields → org_members (by user_id+guild)
  const USER_COLS   = ['firstname', 'lastname', 'phone', 'line_id', 'google_id']
  const MEMBER_COLS = ['nickname', 'member_id', 'specialty', 'amphoe', 'primary_province', 'bank_name', 'account_no', 'account_holder']

  const userUpd = {}, memberUpd = {}
  for (const key of USER_COLS)   if (key in body) userUpd[key]   = body[key] || null
  for (const key of MEMBER_COLS) if (key in body) memberUpd[key] = body[key] || null

  if (Object.keys(userUpd).length === 0 && Object.keys(memberUpd).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  // เบอร์เป็น login credential (phone OTP login) — แก้เองจาก profile = ไม่ verified อีกต่อไป
  if ('phone' in userUpd) userUpd.phone_verified_at = null

  // users มี updated_at · org_members ไม่มี (แยก update)
  if (Object.keys(userUpd).length > 0) {
    userUpd.updated_at = new Date()
    const keys = Object.keys(userUpd)
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
    await pool.query(
      `UPDATE users SET ${setClause} WHERE discord_id = $${keys.length + 1}`,
      [...Object.values(userUpd), discordId]
    )
  }
  if (Object.keys(memberUpd).length > 0) {
    const keys = Object.keys(memberUpd)
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
    await pool.query(
      `UPDATE org_members om SET ${setClause}
       FROM users u WHERE om.user_id = u.id AND u.discord_id = $${keys.length + 1} AND om.guild_id = $${keys.length + 2}`,
      [...Object.values(memberUpd), discordId, guildId]
    )
  }

  return Response.json({ ok: true })
}
