/**
 * web/lib/aiCreds.js — หา API key + โมเดลที่จะใช้ยิง AI ให้ "องค์กรนี้" (ฝั่งเว็บ)
 *
 * คู่แฝดฝั่งบอท: `db/aiCreds.js` — **แก้ไฟล์ไหนต้องแก้อีกไฟล์ด้วยเสมอ** กติกาต้องตรงกันเป๊ะ
 *
 * กติกา (เคาะ 2026-08-10 · ดู md/PENDING.md):
 *   1. org กรอก key เอง → ใช้ key + โมเดลของ org · บิลวิ่งไปหาเขา · ไม่นับโควตา
 *   2. org ไม่มี key     → ยืม key กลางจาก .env ตามโควตารายวัน · 0 = ยืมไม่ได้ · หมด = โยน code 'quota'
 *   3. ตอนยืม key กลาง org เลือกโมเดลเองไม่ได้ (เลือกรุ่นแพงได้ต่อเมื่อจ่ายเอง)
 */
import pool from '@/db/index.js'
import { orgIdOfGuild } from '@/db/guilds.js'
import aiCrypto from '@/../utils/aiCrypto.js'
import aiConstants from '@/../config/aiConstants.js'

const { decryptSecret } = aiCrypto
const { ORG_AI_KEY, DEFAULT_SHARED_QUOTA, SHARED_ENV_KEY, DEFAULT_MODEL, PROVIDERS, todayTH } = aiConstants

export class AiCredsError extends Error {
  constructor(message, code) { super(message); this.name = 'AiCredsError'; this.code = code }
}

const ALL_KEYS = [
  ORG_AI_KEY.provider, ORG_AI_KEY.modelLight, ORG_AI_KEY.modelWriting,
  ORG_AI_KEY.sharedQuota, ORG_AI_KEY.sharedUsage,
  ORG_AI_KEY.apiKey.claude, ORG_AI_KEY.apiKey.gemini,
]

async function readOrgAi(orgId) {
  if (!orgId) return {}
  const { rows } = await pool.query(
    `SELECT key, value FROM org_config WHERE org_id = $1 AND key = ANY($2)`,
    [orgId, ALL_KEYS]
  )
  const out = {}
  for (const r of rows) if (r.value !== null && r.value !== '') out[r.key] = r.value
  return out
}

function usedToday(rawUsage) {
  try {
    const obj = JSON.parse(rawUsage || '{}')
    return obj.date === todayTH() ? (Number(obj.count) || 0) : 0
  } catch {
    return 0   // ค่าเพี้ยน = เริ่มนับใหม่
  }
}

/** นับ 1 ครั้งถ้ายังไม่เต็ม — ไม่ atomic (โควตาไม่ใช่เงิน เกิน 1-2 ครั้งรับได้ เหมือน postsAiQuota) */
async function consumeSharedQuota(orgId, limit, rawUsage) {
  const used = usedToday(rawUsage)
  if (used >= limit) return { ok: false, used }

  await pool.query(
    `INSERT INTO org_config (org_id, key, value, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (org_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [orgId, ORG_AI_KEY.sharedUsage, JSON.stringify({ date: todayTH(), count: used + 1 })]
  )
  return { ok: true, used: used + 1 }
}

/**
 * @param {{orgId?:number, guildId?:string, task?:'light'|'writing', legacy?:{provider?:string, model?:string}}} ctx
 * @returns {Promise<{provider:string, model:string, apiKey:string, source:'org'|'shared'}>}
 */
export async function getAiCreds({ orgId = null, guildId = null, task = 'light', legacy = {} } = {}) {
  const oid = orgId ?? (guildId ? await orgIdOfGuild(guildId) : null)
  const cfg = await readOrgAi(oid)

  const provider = PROVIDERS.includes(cfg[ORG_AI_KEY.provider]) ? cfg[ORG_AI_KEY.provider]
                 : PROVIDERS.includes(legacy.provider) ? legacy.provider
                 : 'claude'

  // ① key ของ org เอง
  const orgKey = decryptSecret(cfg[ORG_AI_KEY.apiKey[provider]])
  if (orgKey) {
    const orgModel = task === 'writing' ? cfg[ORG_AI_KEY.modelWriting] : cfg[ORG_AI_KEY.modelLight]
    return {
      provider,
      model: orgModel || legacy.model || DEFAULT_MODEL[provider][task],
      apiKey: orgKey,
      source: 'org',
    }
  }

  // ② ยืม key กลาง — โมเดลใช้ของเจ้าของระบบเท่านั้น ไม่อ่านค่าที่ org ตั้ง
  const sharedKey = process.env[SHARED_ENV_KEY[provider]]
  const model = legacy.model || DEFAULT_MODEL[provider][task]

  const limit = cfg[ORG_AI_KEY.sharedQuota] !== undefined
    ? Number(cfg[ORG_AI_KEY.sharedQuota])
    : DEFAULT_SHARED_QUOTA

  if (!sharedKey || !Number.isFinite(limit) || limit <= 0) {
    throw new AiCredsError('องค์กรนี้ยังไม่ได้ตั้งค่า AI — ใส่ API key ที่ ตั้งค่าองค์กร > AI', 'no_key')
  }

  if (!oid) return { provider, model, apiKey: sharedKey, source: 'shared' }

  const quota = await consumeSharedQuota(oid, limit, cfg[ORG_AI_KEY.sharedUsage])
  if (!quota.ok) {
    throw new AiCredsError(
      `โควตาทดลองใช้ AI วันนี้หมดแล้ว (${limit} ครั้ง/วัน) — ใส่ API key ขององค์กรที่ ตั้งค่าองค์กร > AI เพื่อใช้ต่อ`,
      'quota'
    )
  }
  return { provider, model, apiKey: sharedKey, source: 'shared' }
}

/** สถานะไว้โชว์หน้าตั้งค่า — ไม่คืนตัว key */
export async function getAiStatus(orgId) {
  const cfg = await readOrgAi(orgId)
  const limit = cfg[ORG_AI_KEY.sharedQuota] !== undefined
    ? Number(cfg[ORG_AI_KEY.sharedQuota])
    : DEFAULT_SHARED_QUOTA
  const used = usedToday(cfg[ORG_AI_KEY.sharedUsage])

  return {
    provider: cfg[ORG_AI_KEY.provider] || null,
    modelLight: cfg[ORG_AI_KEY.modelLight] || null,
    modelWriting: cfg[ORG_AI_KEY.modelWriting] || null,
    hasKey: {
      claude: Boolean(decryptSecret(cfg[ORG_AI_KEY.apiKey.claude])),
      gemini: Boolean(decryptSecret(cfg[ORG_AI_KEY.apiKey.gemini])),
    },
    sharedQuota: { limit, used, remaining: Math.max(0, limit - used) },
  }
}
