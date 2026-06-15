import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isAdmin, isSuperAdmin } from '@/lib/roles.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getAdminGuildIds } from '@/db/guilds.js'
import { getGuildId } from '@/lib/guildContext.js'
import pool from '@/db/index.js'

// features ที่ toggle ได้ — finance + contacts + bot เปิดตลอด (ไม่อยู่ในนี้)
const TOGGLEABLE = ['calling']

async function authGuildAdmin(session, guildId) {
  // effective discordId เป็น null ตอน view-as-role → super/adminGuild bypass ปิด ตาม debug role
  const { access, discordId } = await getEffectiveIdentity(session)
  if (isSuperAdmin(discordId)) return true
  if (!isAdmin(access)) return false
  const adminGuildIds = await getAdminGuildIds(discordId)
  return adminGuildIds.includes(guildId)
}

// GET → { guildId, toggleable: [...], enabled: [...] }
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const guildId = await getGuildId(session)
  if (!(await authGuildAdmin(session, guildId))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { rows } = await pool.query(
    `SELECT value FROM dc_guild_config WHERE guild_id = $1 AND "key" = 'enabled_features'`,
    [guildId]
  )
  const v = rows[0]?.value
  const enabled = Array.isArray(v) ? v : []
  return Response.json({ guildId, toggleable: TOGGLEABLE, enabled })
}

// PATCH { feature, on } → เปิด/ปิด feature เดียวของ guild ปัจจุบัน
export async function PATCH(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const guildId = await getGuildId(session)
  if (!(await authGuildAdmin(session, guildId))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { feature, on } = await req.json()
  if (!TOGGLEABLE.includes(feature)) {
    return Response.json({ error: 'invalid feature' }, { status: 400 })
  }

  const { rows } = await pool.query(
    `SELECT value FROM dc_guild_config WHERE guild_id = $1 AND "key" = 'enabled_features'`,
    [guildId]
  )
  const cur = Array.isArray(rows[0]?.value) ? rows[0].value : []
  const set = new Set(cur)
  if (on) set.add(feature)
  else set.delete(feature)
  const next = TOGGLEABLE.filter(f => set.has(f)) // เก็บลำดับคงที่ + ทิ้งค่าแปลกปลอม

  await pool.query(
    `INSERT INTO dc_guild_config (guild_id, "key", value) VALUES ($1, 'enabled_features', $2)
     ON CONFLICT (guild_id, "key") DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
    [guildId, JSON.stringify(next)]
  )

  return Response.json({ ok: true, enabled: next })
}
