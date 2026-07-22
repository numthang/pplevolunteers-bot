import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { getGuildId } from '@/lib/guildContext.js'
import { getOrgId } from '@/lib/orgContext.js'
import { setSelfDeclaredScope } from '@/db/orgMemberRoles.js'
import { clearScopeTreeCache } from '@/lib/resolveAccessV2.js'
import pool from '@/db/index.js'
import geographyData from '@/lib/thailand-geography.json'

const PROVINCE_LIST = geographyData.map(p => p.province)

/**
 * หาแถวโปรไฟล์ของคนนี้ใน org ปัจจุบัน
 *
 * org ที่มี Discord: org_members เป็นแถวต่อ guild → เอาแถวของ guild ที่กำลังดูอยู่
 * org ที่ไม่มี Discord: มีแถวเดียวต่อคน guild_id = NULL
 * เดิม query ผูกกับ u.discord_id + guild_id ตรงๆ → คนที่ล็อกอินด้วย email ไม่มีทั้งคู่
 * เปิดหน้าโปรไฟล์แล้วได้ค่าว่างเปล่า แก้อะไรก็ไม่ลง
 */
async function findProfileRowId(userId, orgId, guildId) {
  const { rows } = await pool.query(
    `SELECT id FROM org_members
      WHERE user_id = $1 AND org_id = $2
      ORDER BY COALESCE(guild_id = $3, false) DESC, (guild_id IS NULL) DESC, id
      LIMIT 1`,
    [userId, orgId, guildId || null]
  )
  return rows[0]?.id || null
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const guildId = await getGuildId(session)
  // identity (firstname/lastname/phone/line_id/google_id/username) → users · ที่เหลือ → org_members
  const orgId = await getOrgId(session)
  const rowId = await findProfileRowId(session.user.userId, orgId, guildId)
  const { rows } = rowId ? await pool.query(
    `SELECT om.nickname, u.firstname, u.lastname, om.member_id, om.specialty, om.amphoe, om.province, om.region,
            u.phone, u.line_id, u.google_id, om.roles, om.interests, u.username, om.display_name, om.primary_province,
            om.bank_name, om.account_no, om.account_holder,
            om.house_no, om.moo, om.soi, om.road, om.tambon, om.zipcode
     FROM org_members om JOIN users u ON u.id = om.user_id
     WHERE om.id = $1`,
    [rowId]
  ) : { rows: [] }

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
  // ช่องจังหวัด = จังหวัดของ "ที่อยู่" → ต้องเลือกได้ครบทุกจังหวัด
  //
  // เดิมจำกัดไว้เฉพาะจังหวัดที่เดาจากชื่อยศ Discord ('ทีม<จังหวัด>') ทำให้คนที่มียศ
  // ทีมเดียวเลือกได้จังหวัดเดียว — กรอกที่อยู่จริงไม่ได้ถ้าอยู่คนละจังหวัดกับทีม
  // และมันไม่ได้กันอะไรอยู่แล้ว: แผงเลือกจังหวัดบน Discord (handlers/provinceSelect.js)
  // ให้กดได้ทั้ง 80 ปุ่ม ใครกดก็ติด ไม่ต้องมีคนอนุมัติ → การเปิดครบที่นี่คือทำให้ตรงกัน
  // ไม่ใช่การเปิดสิทธิ์กว้างขึ้น (จังหวัดบอกแค่ "อยู่ไหน" การเห็นเบอร์ยังต้องมียศแต่งตั้ง)
  const provinceOptions = PROVINCE_LIST

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
  const MEMBER_COLS = ['nickname', 'member_id', 'specialty', 'amphoe', 'primary_province', 'bank_name', 'account_no', 'account_holder',
                       'house_no', 'moo', 'soi', 'road', 'tambon', 'zipcode']

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
  const orgId = await getOrgId(session)
  if (Object.keys(memberUpd).length > 0) {
    const rowId = await findProfileRowId(session.user.userId, orgId, guildId)
    if (!rowId) return Response.json({ error: 'ไม่พบโปรไฟล์ใน org นี้' }, { status: 404 })
    const keys = Object.keys(memberUpd)
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
    await pool.query(
      `UPDATE org_members SET ${setClause} WHERE id = $${keys.length + 1}`,
      [...Object.values(memberUpd), rowId]
    )
  }

  // จังหวัดในที่อยู่ = พื้นที่ที่เจ้าตัวประกาศเอง (ของเทียบเท่า provinceSelect ของ Discord)
  // ไม่ให้สิทธิ์อะไร — แค่บอกว่าอยู่ไหน · การเห็นเบอร์ยังต้องมียศแต่งตั้งเหมือนเดิม
  if ('primary_province' in memberUpd) {
    await setSelfDeclaredScope(orgId, session.user.userId, memberUpd.primary_province)
    // เพิ่ง INSERT node ใหม่ — ต้องล้าง cache ต้นไม้พื้นที่ (TTL 5 นาที) ไม่งั้นสิทธิ์ยังไม่มาจนกว่าจะหมดอายุ
    clearScopeTreeCache(orgId)
  }

  return Response.json({ ok: true })
}
