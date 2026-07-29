import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { canManageSocialGuild, isSuperAdmin } from '@/lib/roles.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { orgIdOfGuild } from '@/db/guilds.js'
import { getOrgId } from '@/lib/orgContext.js'
import pool from '@/db/index.js'

const SELECT = `SELECT id, org_id, owner_user_id, guild_id, user_discord_id, name, group_name, platform, social_id,
                       access_token IS NOT NULL AS has_access_token,
                       user_token IS NOT NULL AS has_user_token,
                       user_token_expires_at, visibility, created_at
                FROM dc_social_accounts`

// private account เป็นของ "ผู้ใช้" ไม่ใช่ของ guild/org (bug-063) → ตามตัวเจ้าของไปทุก org
// ยึด owner_user_id (user ที่ล็อกอินด้วยอีเมลก็มี) · fallback discord id เผื่อ session เก่าที่ยังไม่มี userId
function selectOwnAccounts(session) {
  const userId = session.user.userId
  if (userId) {
    return pool.query(`${SELECT} WHERE owner_user_id = $1 AND visibility = 'private' ORDER BY platform, id`, [userId])
  }
  const discordId = session.user.discordId
  if (discordId) {
    return pool.query(`${SELECT} WHERE user_discord_id = $1 AND visibility = 'private' ORDER BY platform, id`, [discordId])
  }
  return { rows: [] }
}

// GET → public accounts ของ org ปัจจุบัน (ทุก guild ในองค์กร) + private accounts ของ user เอง
//
// ⚠️ public scope = org ไม่ใช่ guild — org เดียวมีได้หลาย guild (อาสาฯ/ราชบุรี/People's Party)
// เดิมกรองด้วย guild ทำให้บัญชีของ guild อื่นในองค์กรเดียวกันหายไปทั้งที่เป็นบัญชีขององค์กรนี้
// guild_id ที่เหลือเป็น metadata: บอทใช้เลือกบัญชี default ของแต่ละ guild · group_name = ป้ายให้คนอ่าน
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { access, discordId: effDiscordId } = await getEffectiveIdentity(session)
  const canManage  = canManageSocialGuild(access)             // permission ระดับ org (resolveAccessV2)
  const superAdmin = isSuperAdmin(effDiscordId)               // gate = effective (debug-aware)
  const orgId      = await getOrgId(session)

  const [pub, priv] = await Promise.all([
    (superAdmin || canManage) && orgId
      ? pool.query(`${SELECT} WHERE org_id = $1 AND visibility = 'public' ORDER BY group_name, platform, id`, [orgId])
      : { rows: [] },
    selectOwnAccounts(session),
  ])

  return Response.json([...pub.rows, ...priv.rows])
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { access, discordId: effDiscordId } = await getEffectiveIdentity(session)
  const canManage  = canManageSocialGuild(access)
  const superAdmin = isSuperAdmin(effDiscordId)               // gate = effective (debug-aware)

  const body = await req.json()
  const { guild_id, name, platform, social_id, access_token, user_token } = body
  let { visibility = 'public' } = body

  if (!platform || !social_id) {
    return Response.json({ error: 'platform, social_id required' }, { status: 400 })
  }

  // scope มาจาก session เสมอ ไม่รับจาก client (กันยัดบัญชีเข้าองค์กรอื่น)
  const orgId = await getOrgId(session)
  if (!orgId) return Response.json({ error: 'no active org' }, { status: 403 })

  // guild_id เป็น metadata ที่เลือกได้ (org ไม่มี guild ก็ส่ง null) แต่ต้องเป็น guild ขององค์กรตัวเอง
  if (guild_id && (await orgIdOfGuild(guild_id)) !== orgId) {
    return Response.json({ error: 'guild ไม่ได้อยู่ในองค์กรนี้' }, { status: 403 })
  }

  // non-manager → force private, ห้ามสร้าง public account
  // public = บัญชีขององค์กร → ต้องมีสิทธิ์ระดับ org (permission-based, ไม่ผูกยศ Discord ของ guild ใด)
  if (!superAdmin && !canManage) {
    visibility = 'private'
  }

  // owner_user_id ตั้งเฉพาะแถว private — public เป็นของ org (owner NULL) ไม่งั้นคีย์ไม่ตรงกับ backfill
  const ownerUserId = visibility === 'private' ? (session.user.userId || null) : null

  await pool.query(
    `INSERT INTO dc_social_accounts (org_id, owner_user_id, guild_id, user_discord_id, name, platform, social_id, access_token, user_token, visibility)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (COALESCE(org_id, 0), COALESCE(owner_user_id, 0), COALESCE(guild_id, ''), platform, social_id) DO UPDATE SET
       name = EXCLUDED.name, access_token = EXCLUDED.access_token,
       user_token = EXCLUDED.user_token, visibility = EXCLUDED.visibility`,
    [orgId, ownerUserId, guild_id || null, session.user.discordId || null, name || platform, platform,
     social_id, access_token || null, user_token || null, visibility]
  )

  return Response.json({ ok: true })
}
