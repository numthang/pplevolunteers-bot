// config/aiConstants.js — ชื่อคีย์ + ค่า default ของ AI ราย org (zero-dep, ใช้ทั้ง bot + web)
// ⚠️ แก้ที่นี่ที่เดียว — db/aiCreds.js (bot) และ web/lib/aiCreds.js (web) อ่านจากไฟล์นี้ทั้งคู่

// คีย์ใน org_config (value เป็น text ไม่ใช่ json — ต่างจาก dc_guild_config)
const ORG_AI_KEY = {
  provider:     'ai_provider',
  modelLight:   'ai_model_light',      // งานเบา: สรุปแชท / case timeline / ร่างหนังสือ
  modelWriting: 'ai_model_writing',    // งานเขียน: posts (outline/draft/polish/caption)
  sharedQuota:  'ai_shared_quota_daily',
  sharedUsage:  'ai_shared_usage',     // {"date":"2026-08-10","count":3}
  apiKey: { claude: 'ai_api_key_claude', gemini: 'ai_api_key_gemini' },
};

// org ที่ไม่ได้ตั้งค่า = ยืม key กลางได้วันละเท่านี้ · 0 = ยืมไม่ได้ · ตั้งสูง = ยืมได้เต็มที่
// (ตัวเลขเดียวทำหน้าที่แทนทั้งสวิตช์เปิด/ปิดและเพดาน — ดู md/PENDING.md)
const DEFAULT_SHARED_QUOTA = 30;

const SHARED_ENV_KEY = { claude: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY' };

// รุ่นที่ระบบทดสอบแล้ว — ใช้เมื่อ org ยังไม่เลือกเอง
const DEFAULT_MODEL = {
  claude: { light: 'claude-haiku-4-5-20251001', writing: 'claude-sonnet-5' },
  gemini: { light: 'gemini-2.0-flash',          writing: 'gemini-2.0-flash' },
};

const PROVIDERS = ['claude', 'gemini'];

/** YYYY-MM-DD เวลาไทย — server รันบน UTC (ดู gotcha timezone ใน CLAUDE.md) */
function todayTH() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

module.exports = {
  ORG_AI_KEY, DEFAULT_SHARED_QUOTA, SHARED_ENV_KEY, DEFAULT_MODEL, PROVIDERS, todayTH,
};
