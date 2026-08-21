import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isSuperAdmin } from '@/lib/roles.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getGuildId } from '@/lib/guildContext.js'
import { orgIdOfGuild } from '@/db/guilds.js'
import { getPrompt, setPrompt, resetPrompt } from '@/db/orgAiPrompts.js'
import aiPrompts from '@/../config/aiPrompts.js'

// prompt "บุคลิกบอทตอน mention" (org_ai_prompts, kind='slot', value='bot.ai_mention')
// scope ด้วย org ของ guild ที่ active อยู่ — เหมือน /api/bot/features (guild-first ไม่ใช่ org switcher)
const { defaultParts } = aiPrompts
const SLOT = 'bot.ai_mention'

async function authAdmin(session) {
  if (!session) return { error: 'Unauthorized', status: 401 }
  const { discordId } = await getEffectiveIdentity(session)
  if (!isSuperAdmin(discordId)) return { error: 'Forbidden', status: 403 }
  return { ok: true }
}

async function resolveOrgId(session) {
  return await orgIdOfGuild(await getGuildId(session))
}

// GET → { prompt, defaultPrompt, isDefault }
export async function GET() {
  const session = await getServerSession(authOptions)
  const a = await authAdmin(session)
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })

  const def = defaultParts(SLOT)
  const orgId = await resolveOrgId(session)
  const prompt = orgId ? await getPrompt(SLOT, orgId) : def.head
  return Response.json({ prompt, defaultPrompt: def.head, isDefault: prompt === def.head })
}

// PATCH { prompt } → แก้ทับของ org ที่ guild นี้ผูกอยู่
export async function PATCH(req) {
  const session = await getServerSession(authOptions)
  const a = await authAdmin(session)
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })

  const orgId = await resolveOrgId(session)
  if (!orgId) return Response.json({ error: 'guild นี้ยังไม่ผูก org' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const prompt = String(body.prompt || '').trim()
  if (!prompt) return Response.json({ error: 'prompt ว่าง' }, { status: 400 })

  const userId = session.user?.userId ?? null
  const res = await setPrompt(orgId, SLOT, prompt, userId)
  if (!res.ok) return Response.json({ error: 'unknown slot' }, { status: 400 })
  return Response.json({ ok: true })
}

// DELETE → คืนค่าเดิมของระบบ (ลบ override ของ org นี้)
export async function DELETE() {
  const session = await getServerSession(authOptions)
  const a = await authAdmin(session)
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })

  const orgId = await resolveOrgId(session)
  if (orgId) await resetPrompt(orgId, SLOT)
  return Response.json({ ok: true })
}
