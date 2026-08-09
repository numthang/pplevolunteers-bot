// db/aiCreds.js — หา API key + โมเดลที่จะใช้ยิง AI ให้ "องค์กรนี้" (ฝั่งบอท)
//
// กติกา (เคาะ 2026-08-10 · ดู md/PENDING.md):
//   1. org กรอก key เอง  → ใช้ key + โมเดลของ org · บิลวิ่งไปหาเขา · ไม่นับโควตา
//   2. org ไม่มี key      → ยืม key กลางจาก .env ได้ **ตามโควตารายวัน** (ตัวเลขใน org_config)
//                          โควตา 0 = ยืมไม่ได้ · โควตาหมด = โยน AiCredsError code 'quota'
//   3. ตอนยืม key กลาง org **เลือกโมเดลเองไม่ได้** — ใช้ค่าที่เจ้าของระบบตั้งไว้ที่ backoffice
//      (เลือกรุ่นแพงได้ต่อเมื่อจ่ายเอง ไม่งั้นเปิดช่องให้เผาเงินคนอื่น)
//
// คู่แฝดฝั่งเว็บ: web/lib/aiCreds.js — แก้ไฟล์นี้แล้วต้องแก้ตัวนั้นด้วยเสมอ
const pool = require('./index');
const { orgIdOfGuild } = require('./org');
const { decryptSecret } = require('../utils/aiCrypto');
const {
  ORG_AI_KEY, DEFAULT_SHARED_QUOTA, SHARED_ENV_KEY, DEFAULT_MODEL, PROVIDERS, todayTH,
} = require('../config/aiConstants');

class AiCredsError extends Error {
  constructor(message, code) { super(message); this.name = 'AiCredsError'; this.code = code; }
}

const ALL_KEYS = [
  ORG_AI_KEY.provider, ORG_AI_KEY.modelLight, ORG_AI_KEY.modelWriting,
  ORG_AI_KEY.sharedQuota, ORG_AI_KEY.sharedUsage,
  ORG_AI_KEY.apiKey.claude, ORG_AI_KEY.apiKey.gemini,
];

async function readOrgAi(orgId) {
  if (!orgId) return {};
  const { rows } = await pool.query(
    `SELECT key, value FROM org_config WHERE org_id = $1 AND key = ANY($2)`,
    [orgId, ALL_KEYS]
  );
  const out = {};
  for (const r of rows) if (r.value !== null && r.value !== '') out[r.key] = r.value;
  return out;
}

/** นับ 1 ครั้งถ้ายังไม่เต็ม — ไม่ atomic (โควตาไม่ใช่เงิน เกิน 1-2 ครั้งรับได้ เหมือน postsAiQuota) */
async function consumeSharedQuota(orgId, limit, rawUsage) {
  let used = 0;
  try {
    const obj = JSON.parse(rawUsage || '{}');
    if (obj.date === todayTH()) used = Number(obj.count) || 0;
  } catch { /* ค่าเพี้ยน = เริ่มนับใหม่ */ }

  if (used >= limit) return { ok: false, used };

  await pool.query(
    `INSERT INTO org_config (org_id, key, value, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (org_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [orgId, ORG_AI_KEY.sharedUsage, JSON.stringify({ date: todayTH(), count: used + 1 })]
  );
  return { ok: true, used: used + 1 };
}

/**
 * @param {{orgId?:number, guildId?:string, task?:'light'|'writing', legacy?:{provider?:string, model?:string}}} ctx
 *   legacy = ค่าที่เจ้าของระบบตั้งไว้ที่ backoffice (dc_guild_config global) — ใช้เป็นค่าตั้งต้น
 * @returns {Promise<{provider:string, model:string, apiKey:string, source:'org'|'shared'}>}
 */
async function getAiCreds({ orgId = null, guildId = null, task = 'light', legacy = {} } = {}) {
  const oid = orgId ?? (guildId ? await orgIdOfGuild(guildId) : null);
  const cfg = await readOrgAi(oid);

  const provider = PROVIDERS.includes(cfg[ORG_AI_KEY.provider]) ? cfg[ORG_AI_KEY.provider]
                 : PROVIDERS.includes(legacy.provider) ? legacy.provider
                 : 'claude';

  // ① key ของ org เอง
  const orgKey = decryptSecret(cfg[ORG_AI_KEY.apiKey[provider]]);
  if (orgKey) {
    const orgModel = task === 'writing' ? cfg[ORG_AI_KEY.modelWriting] : cfg[ORG_AI_KEY.modelLight];
    return {
      provider,
      model: orgModel || legacy.model || DEFAULT_MODEL[provider][task],
      apiKey: orgKey,
      source: 'org',
    };
  }

  // ② ยืม key กลาง — โมเดลใช้ของเจ้าของระบบเท่านั้น ไม่อ่านค่าที่ org ตั้ง
  const sharedKey = process.env[SHARED_ENV_KEY[provider]];
  const model = legacy.model || DEFAULT_MODEL[provider][task];

  const limit = cfg[ORG_AI_KEY.sharedQuota] !== undefined
    ? Number(cfg[ORG_AI_KEY.sharedQuota])
    : DEFAULT_SHARED_QUOTA;

  if (!sharedKey || !Number.isFinite(limit) || limit <= 0) {
    throw new AiCredsError('องค์กรนี้ยังไม่ได้ตั้งค่า AI — ใส่ API key ที่ตั้งค่าองค์กร > AI', 'no_key');
  }

  // ไม่รู้ว่า org ไหน (guild กำพร้าที่ยังไม่ map เข้า org) → ยืมได้ แต่นับไม่ได้
  if (!oid) return { provider, model, apiKey: sharedKey, source: 'shared' };

  const quota = await consumeSharedQuota(oid, limit, cfg[ORG_AI_KEY.sharedUsage]);
  if (!quota.ok) {
    throw new AiCredsError(
      `โควตาทดลองใช้ AI วันนี้หมดแล้ว (${limit} ครั้ง/วัน) — ใส่ API key ขององค์กรที่ตั้งค่าองค์กร > AI เพื่อใช้ต่อ`,
      'quota'
    );
  }
  return { provider, model, apiKey: sharedKey, source: 'shared' };
}

/** สถานะไว้โชว์หน้าตั้งค่า — ไม่คืนตัว key */
async function getAiStatus(orgId) {
  const cfg = await readOrgAi(orgId);
  let used = 0;
  try {
    const obj = JSON.parse(cfg[ORG_AI_KEY.sharedUsage] || '{}');
    if (obj.date === todayTH()) used = Number(obj.count) || 0;
  } catch { /* ignore */ }

  const limit = cfg[ORG_AI_KEY.sharedQuota] !== undefined
    ? Number(cfg[ORG_AI_KEY.sharedQuota])
    : DEFAULT_SHARED_QUOTA;

  return {
    provider: cfg[ORG_AI_KEY.provider] || null,
    modelLight: cfg[ORG_AI_KEY.modelLight] || null,
    modelWriting: cfg[ORG_AI_KEY.modelWriting] || null,
    hasKey: {
      claude: Boolean(decryptSecret(cfg[ORG_AI_KEY.apiKey.claude])),
      gemini: Boolean(decryptSecret(cfg[ORG_AI_KEY.apiKey.gemini])),
    },
    sharedQuota: { limit, used, remaining: Math.max(0, limit - used) },
  };
}

module.exports = { getAiCreds, getAiStatus, AiCredsError, readOrgAi };
