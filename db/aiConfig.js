// db/aiConfig.js
// อ่าน AI config จาก DB — modes (dc_ai_modes) + agent (provider/model/max_tokens ใน dc_guild_config global)
// fallback เป็นค่า hardcode ใน config/aiModes.js เสมอ ถ้า DB ว่าง/ล่ม → AI ไม่พัง
const pool = require('./index');
const { getSetting } = require('./settings');
const { AI_MODES } = require('../config/aiModes');

const GLOBAL = 'global';

// default ของแต่ละค่าย — ใช้เมื่อ backoffice ยังไม่เคยตั้ง
const DEFAULTS = { provider: 'claude', maxTokens: 4096 };
const DEFAULT_MODEL = { claude: 'claude-haiku-4-5-20251001', gemini: 'gemini-2.0-flash' };

// modes ที่ enabled — guild row override global row ตาม value; ถ้า DB ว่าง → code AI_MODES
// (column guild_id รองรับ per-guild ในอนาคต — ตอนนี้ backoffice แก้เฉพาะ global)
async function getModes(guildId) {
  let rows;
  try {
    ({ rows } = await pool.query(
      `SELECT guild_id, value, label, prompt, sort_order, enabled
       FROM dc_ai_modes WHERE guild_id IN ($1, $2)
       ORDER BY sort_order ASC, id ASC`,
      [guildId || GLOBAL, GLOBAL]
    ));
  } catch (err) {
    console.error('[aiConfig] getModes failed, fallback to code:', err.message);
    return AI_MODES.map((m, i) => ({ ...m, sort_order: i + 1, enabled: true }));
  }
  if (!rows.length) return AI_MODES.map((m, i) => ({ ...m, sort_order: i + 1, enabled: true }));

  const byVal = new Map();
  for (const r of rows) {
    const cur = byVal.get(r.value);
    if (!cur || (r.guild_id !== GLOBAL && cur.guild_id === GLOBAL)) byVal.set(r.value, r);
  }
  return [...byVal.values()]
    .filter(r => r.enabled)
    .sort((a, b) => a.sort_order - b.sort_order);
}

// mode เดียวตาม value — ใช้เติม prompt; ถ้าไม่เจอคืน null
async function getMode(guildId, value) {
  const modes = await getModes(guildId);
  return modes.find(m => m.value === value) || null;
}

// key กลางจาก .env — ราย provider (org ที่กรอก key เองจะมาแทนที่ตรงนี้ในขั้นถัดไป)
const SHARED_KEY = { claude: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY' };

// agent config — { provider, model, maxTokens, apiKey }
// ctx = { orgId, guildId } · ตอนนี้ยังอ่านแถว global อย่างเดียว (ยังไม่ใช้ ctx)
// ขั้นถัดไปจะใช้ ctx เลือก key/model ราย org — call site ทุกตัวส่ง ctx มาแล้ว ไม่ต้องไล่แก้ซ้ำ
async function getAgentConfig(ctx = {}) {
  let provider, model, maxTokens;
  try {
    [provider, model, maxTokens] = await Promise.all([
      getSetting(GLOBAL, 'ai.provider'),
      getSetting(GLOBAL, 'ai.model'),
      getSetting(GLOBAL, 'ai.max_tokens'),
    ]);
  } catch (err) {
    console.error('[aiConfig] getAgentConfig failed, using defaults:', err.message);
  }
  const p = provider || DEFAULTS.provider;
  return {
    provider: p,
    model: model || DEFAULT_MODEL[p] || DEFAULT_MODEL.claude,
    maxTokens: Number(maxTokens) || DEFAULTS.maxTokens,
    apiKey: process.env[SHARED_KEY[p]] || null,
  };
}

module.exports = { getModes, getMode, getAgentConfig, DEFAULT_MODEL, DEFAULTS, GLOBAL };
