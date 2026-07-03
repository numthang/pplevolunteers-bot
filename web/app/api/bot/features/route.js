import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isSuperAdmin } from '@/lib/roles.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getGuildId } from '@/lib/guildContext.js'
import pool from '@/db/index.js'

// features ที่ toggle ได้ — bot เปิดตลอด (ไม่อยู่ในนี้) · default ทุกตัว = ปิด
const TOGGLEABLE = ['finance', 'calling', 'docs', 'cases', 'ai_mention']

async function authGuildAdmin(session) {
  const { discordId } = await getEffectiveIdentity(session)
  return isSuperAdmin(discordId)
}

// GET → { guildId, toggleable: [...], enabled: [...] }
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const guildId = await getGuildId(session)
  if (!(await authGuildAdmin(session))) {
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
  if (!(await authGuildAdmin(session))) {
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
