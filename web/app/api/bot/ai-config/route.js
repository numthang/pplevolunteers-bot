import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isSuperAdmin } from '@/lib/roles.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import pool from '@/db/index.js'

// AI agent config = global infrastructure (ค่าย/โมเดลที่ใช้ทั้งระบบ) → superadmin เท่านั้น
// เก็บใน dc_guild_config guild_id='global' keys: ai.provider / ai.model / ai.max_tokens
const GLOBAL = 'global'
const PROVIDERS = ['claude', 'gemini']
const DEFAULT_MODEL = { claude: 'claude-haiku-4-5-20251001', gemini: 'gemini-2.0-flash' }

async function authAdmin() {
  const session = await getServerSession(authOptions)
  if (!session) return { error: 'Unauthorized', status: 401 }
  const { discordId } = await getEffectiveIdentity(session)  // null ตอน debug → super off
  if (!isSuperAdmin(discordId)) return { error: 'Forbidden', status: 403 }
  return { ok: true }
}

async function getKey(key) {
  const { rows } = await pool.query(
    `SELECT value FROM dc_guild_config WHERE guild_id = $1 AND "key" = $2`, [GLOBAL, key]
  )
  return rows[0]?.value ?? null
}
async function setKey(key, value) {
  await pool.query(
    `INSERT INTO dc_guild_config (guild_id, "key", value) VALUES ($1, $2, $3)
     ON CONFLICT (guild_id, "key") DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
    [GLOBAL, key, JSON.stringify(value)]
  )
}

// GET → { provider, model, maxTokens, providers, defaultModel }
export async function GET() {
  const a = await authAdmin()
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })

  const [provider, model, maxTokens] = await Promise.all([
    getKey('ai.provider'), getKey('ai.model'), getKey('ai.max_tokens'),
  ])
  const p = provider || 'claude'
  return Response.json({
    provider: p,
    model: model || DEFAULT_MODEL[p],
    maxTokens: Number(maxTokens) || 4096,
    providers: PROVIDERS,
    defaultModel: DEFAULT_MODEL,
  })
}

// PATCH body: { provider, model, maxTokens }
export async function PATCH(req) {
  const a = await authAdmin()
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })

  const body = await req.json().catch(() => ({}))
  const provider = String(body.provider || '')
  if (!PROVIDERS.includes(provider)) return Response.json({ error: 'provider ไม่รองรับ' }, { status: 400 })

  const model = String(body.model || '').trim() || DEFAULT_MODEL[provider]
  const maxTokens = Number(body.maxTokens)
  if (!Number.isInteger(maxTokens) || maxTokens < 256 || maxTokens > 8192) {
    return Response.json({ error: 'max_tokens ต้องเป็น 256–8192' }, { status: 400 })
  }

  await setKey('ai.provider', provider)
  await setKey('ai.model', model)
  await setKey('ai.max_tokens', maxTokens)
  return Response.json({ ok: true })
}
