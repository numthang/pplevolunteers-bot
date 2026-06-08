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
const PROVIDERS = {
  claude: async (system, userContent, model, maxTokens) => {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens, // ไทยกิน token เยอะ (~1 token/ตัวอักษร) — โพสต์ยาวต้องมี headroom
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userContent }],
    });
    return res.content.find(b => b.type === 'text')?.text ?? 'ประมวลผลไม่สำเร็จ';
  },

  gemini: async (system, userContent, model, maxTokens) => {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const gen = client.getGenerativeModel({
      model,
      systemInstruction: system,
      generationConfig: { maxOutputTokens: maxTokens },
    });
    const result = await gen.generateContent(userContent);
    return result.response.text() ?? 'ประมวลผลไม่สำเร็จ';
  },
};

// core — เลือก provider/model จาก agent config แล้วยิง
async function callAI(system, userContent) {
  const { provider, model, maxTokens } = await getAgentConfig();
  const fn = PROVIDERS[provider];
  if (!fn) throw new Error(`AI provider ไม่รองรับ: ${provider}`);
  return fn(system, userContent, model, maxTokens);
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

  const output = await callAI(mode.prompt, `${titleLine}บทสนทนาจาก Discord${countNote}:\n\n${text}`);
  return { mode, output, truncated: messages.length > MAX_MESSAGES };
}

// ── ประมวลผลจาก text ดิบ (ใช้โดย basket editorial — caption ที่ append มา) ──────
async function processText(guildId, text, modeValue, customPrompt = null, promptSuffix = null) {
  let mode = await resolveMode(guildId, modeValue, customPrompt);
  if (promptSuffix && !customPrompt) mode = { ...mode, prompt: mode.prompt + '\n\n' + promptSuffix };
  if (!text?.trim()) return { mode, output: 'ไม่มีข้อความที่ประมวลผลได้' };
  const output = await callAI(mode.prompt, `เนื้อหา:\n\n${text}`);
  return { mode, output };
}

module.exports = { processMessages, processText, MAX_MESSAGES };
