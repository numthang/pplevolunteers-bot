import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isSuperAdmin } from '@/lib/roles.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getGuildId } from '@/lib/guildContext.js'
import pool from '@/db/index.js'

// features ที่ toggle ได้ราย guild — เหลือแค่ของที่ผูก Discord จริง (บอทอ่านเอง index.js:453)
// finance/calling/docs/cases ย้ายไปเป็นสวิตช์ระดับ org แล้ว (2026-07-22) → /org/settings/features
// เดิมสองระบบซ้อนกันแล้ว guild ชนะ ทำให้หน้าฝั่ง org กดไม่มีผล
const TOGGLEABLE = ['ai_mention']

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
  // เก็บลำดับคงที่ · **ไม่ทิ้งคีย์ที่ย้ายไป org แล้ว** (finance/calling/docs/cases)
  // ค่าเดิมเหล่านั้นเป็นต้นทางของ migration 2026-07-22 — ลบทิ้งแล้วรัน migration ซ้ำไม่ได้
  const legacy = cur.filter(f => !TOGGLEABLE.includes(f))
  const next = [...TOGGLEABLE.filter(f => set.has(f)), ...legacy]

  await pool.query(
    `INSERT INTO dc_guild_config (guild_id, "key", value) VALUES ($1, 'enabled_features', $2)
     ON CONFLICT (guild_id, "key") DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
    [guildId, JSON.stringify(next)]
  )

  return Response.json({ ok: true, enabled: next })
}
