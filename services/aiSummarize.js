// services/aiSummarize.js
// ส่งข้อความ Discord ให้ AI ประมวลผลตาม mode ที่เลือก
// provider/model/prompt มาจาก backoffice (DB) — ดู db/aiConfig.js; fallback เป็น config/aiModes.js เสมอ

const { messagesToPlainText } = require('./fetchMessages');
const { getMode: getDbMode, getAgentConfig } = require('../db/aiConfig');
const { getMode: getCodeMode } = require('../config/aiModes');

const MAX_MESSAGES = 500; // กัน token พัง — ส่งแค่ N ข้อความล่าสุด

// คืน mode object { label, value, prompt } — customPrompt ชนะทุกอย่าง, แล้ว DB, แล้ว code
async function resolveMode(guildId, modeValue, customPrompt) {
  if (customPrompt) return { label: '✍️ กำหนดเอง', value: 'custom', prompt: customPrompt };
  const dbMode = await getDbMode(guildId, modeValue);
  if (dbMode) return dbMode;
  return getCodeMode(modeValue); // fallback: DB ว่าง/ไม่เจอ mode นี้
}

// ── AI provider adapter ──────────────────────────────────────────────────────
// system = system prompt (mode.prompt), userContent = เนื้อหาที่ให้ประมวลผล
// apiKey มาจาก getAgentConfig() เสมอ — ห้ามอ่าน process.env ตรงนี้ ไม่งั้น key ราย org ไม่มีผล
const PROVIDERS = {
  claude: async (system, userContent, { model, maxTokens, apiKey }) => {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic.default({ apiKey });
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens, // ไทยกิน token เยอะ (~1 token/ตัวอักษร) — โพสต์ยาวต้องมี headroom
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userContent }],
    });
    return res.content.find(b => b.type === 'text')?.text ?? 'ประมวลผลไม่สำเร็จ';
  },

  gemini: async (system, userContent, { model, maxTokens, apiKey }) => {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const client = new GoogleGenerativeAI(apiKey);
    const gen = client.getGenerativeModel({
      model,
      systemInstruction: system,
      generationConfig: { maxOutputTokens: maxTokens },
    });
    const result = await gen.generateContent(userContent);
    return result.response.text() ?? 'ประมวลผลไม่สำเร็จ';
  },
};

// core — เลือก provider/model/key จาก agent config แล้วยิง
// ⚠️ ctx = { orgId, guildId } — **ต้องส่งเสมอ** ทุก call site ถึงจะผูก call กับองค์กรเจ้าของ key ได้
//    (ปล่อยว่างได้เฉพาะงานของเจ้าของระบบเอง เช่น /cooking หรือ script รันมือ)
async function callAI(system, userContent, ctx = {}) {
  const cfg = await getAgentConfig(ctx);
  const fn = PROVIDERS[cfg.provider];
  if (!fn) throw new Error(`AI provider ไม่รองรับ: ${cfg.provider}`);
  return fn(system, userContent, cfg);
}

// multi-turn — ส่ง messages[] (user/assistant turns) โดยตรง ใช้กับ mention handler
async function callAIWithHistory(system, messages, ctx = {}) {
  const cfg = await getAgentConfig(ctx);
  if (cfg.provider === 'claude') {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic.default({ apiKey: cfg.apiKey });
    const res = await client.messages.create({
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages,
    });
    return res.content.find(b => b.type === 'text')?.text ?? 'ประมวลผลไม่สำเร็จ';
  }
  // Fallback สำหรับ provider อื่น: flatten เป็น text
  const flat = messages.map(m => `${m.role === 'assistant' ? '[บอท]' : '[ผู้ใช้]'}: ${m.content}`).join('\n');
  const fn = PROVIDERS[cfg.provider];
  if (!fn) throw new Error(`AI provider ไม่รองรับ: ${cfg.provider}`);
  return fn(system, flat, cfg);
}

// ── ประมวลผลจาก messages[] (ใช้โดย /message fetch + thread context menu) ───────
// title: ชื่อเธรด/หัวข้อ (optional) — เรื่องหลักที่ AI ควรโฟกัส
// customPrompt: ถ้าส่งมา จะใช้แทน mode สำเร็จรูป (ผู้ใช้พิมพ์เอง)
async function processMessages(guildId, messages, modeValue, title = null, customPrompt = null, promptSuffix = null) {
  let mode = await resolveMode(guildId, modeValue, customPrompt);
  if (promptSuffix && !customPrompt) mode = { ...mode, prompt: mode.prompt + '\n\n' + promptSuffix };
  const capped = messages.slice(-MAX_MESSAGES);
  const text   = messagesToPlainText(capped);

  if (!text.trim()) return { mode, output: 'ไม่มีข้อความที่ประมวลผลได้', truncated: false };

  const countNote = messages.length > MAX_MESSAGES
    ? ` (ใช้ล่าสุด ${MAX_MESSAGES} จาก ${messages.length} ข้อความ)`
    : ` (${capped.length} ข้อความ)`;
  const titleLine = title ? `หัวข้อ/เรื่องหลัก: ${title}\n\n` : '';

  const output = await callAI(mode.prompt, `${titleLine}บทสนทนาจาก Discord${countNote}:\n\n${text}`, { guildId });
  return { mode, output, truncated: messages.length > MAX_MESSAGES };
}

// ── ประมวลผลจาก text ดิบ (ใช้โดย basket editorial — caption ที่ append มา) ──────
async function processText(guildId, text, modeValue, customPrompt = null, promptSuffix = null) {
  let mode = await resolveMode(guildId, modeValue, customPrompt);
  if (promptSuffix && !customPrompt) mode = { ...mode, prompt: mode.prompt + '\n\n' + promptSuffix };
  if (!text?.trim()) return { mode, output: 'ไม่มีข้อความที่ประมวลผลได้' };
  const output = await callAI(mode.prompt, `เนื้อหา:\n\n${text}`, { guildId });
  return { mode, output };
}

module.exports = { processMessages, processText, callAI, callAIWithHistory, MAX_MESSAGES };
