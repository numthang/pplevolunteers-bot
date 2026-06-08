// services/aiSummarize.js
// ส่งข้อความ Discord ให้ Claude ประมวลผลตาม mode ที่เลือก

const { messagesToPlainText } = require('./fetchMessages');
const { getMode } = require('../config/aiModes');

const MAX_MESSAGES = 500; // กัน token พัง — ส่งแค่ N ข้อความล่าสุด

function resolveMode(modeValue, customPrompt) {
  return customPrompt
    ? { label: '✍️ กำหนดเอง', value: 'custom', prompt: customPrompt }
    : getMode(modeValue);
}

// core — ยิง Claude ด้วย system prompt + user content
async function callClaude(userContent, mode) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096, // ไทยกิน token เยอะ (~1 token/ตัวอักษร) — โพสต์ยาวต้องมี headroom ไม่งั้นตัดกลางคำ
    system: [
      { type: 'text', text: mode.prompt, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userContent }],
  });

  return response.content.find(b => b.type === 'text')?.text ?? 'ประมวลผลไม่สำเร็จ';
}

// ── ประมวลผลจาก messages[] (ใช้โดย /message fetch) ────────────────────────────
// title: ชื่อเธรด/หัวข้อ (optional) — ใช้เป็นเรื่องหลักที่ AI ควรโฟกัส
// customPrompt: ถ้าส่งมา จะใช้แทน mode สำเร็จรูป (ผู้ใช้พิมพ์เอง)
async function processMessages(messages, modeValue, title = null, customPrompt = null, promptSuffix = null) {
  let mode = resolveMode(modeValue, customPrompt);
  if (promptSuffix && !customPrompt) mode = { ...mode, prompt: mode.prompt + '\n\n' + promptSuffix };
  const capped = messages.slice(-MAX_MESSAGES);
  const text   = messagesToPlainText(capped);

  if (!text.trim()) return { mode, output: 'ไม่มีข้อความที่ประมวลผลได้', truncated: false };

  const countNote = messages.length > MAX_MESSAGES
    ? ` (ใช้ล่าสุด ${MAX_MESSAGES} จาก ${messages.length} ข้อความ)`
    : ` (${capped.length} ข้อความ)`;
  const titleLine = title ? `หัวข้อ/เรื่องหลัก: ${title}\n\n` : '';

  const output = await callClaude(`${titleLine}บทสนทนาจาก Discord${countNote}:\n\n${text}`, mode);
  return { mode, output, truncated: messages.length > MAX_MESSAGES };
}

// ── ประมวลผลจาก text ดิบ (ใช้โดย basket editorial — caption ที่ append มา) ──────
async function processText(text, modeValue, customPrompt = null, promptSuffix = null) {
  let mode = resolveMode(modeValue, customPrompt);
  if (promptSuffix && !customPrompt) mode = { ...mode, prompt: mode.prompt + '\n\n' + promptSuffix };
  if (!text?.trim()) return { mode, output: 'ไม่มีข้อความที่ประมวลผลได้' };
  const output = await callClaude(`เนื้อหา:\n\n${text}`, mode);
  return { mode, output };
}

module.exports = { processMessages, processText, MAX_MESSAGES };
