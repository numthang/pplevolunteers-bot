// services/caseTimeline.js — AI timeline generation for cases
const { callAI } = require('./aiSummarize');
const { getPrompt } = require('../db/aiPrompts');

/**
 * Generate timeline events from Discord messages
 * messages = [{ id, content, author: { username, bot }, timestamp }]
 * ctx = { orgId, guildId } — องค์กรเจ้าของ key ที่จะยิง AI (ดู callAI ใน aiSummarize.js)
 * Returns [{ body, is_public, occurred_at }] or []
 */
async function generateTimeline(title, messages, ctx = {}) {
  const text = messages
    .filter(m => m.content?.trim() && !m.author?.bot)
    // calendar: 'gregory' กันปี พ.ศ. หลุดเข้าไปในข้อความที่ป้อนให้ AI (default th-TH ใช้ปี พ.ศ.
    // AI เห็นเลขปีนั้นแล้วเข้าใจว่าเป็น ค.ศ. ตรงๆ → occurred_at ที่สกัดออกมาเพี้ยน +543 ปี)
    .map(m => `[${m.timestamp ? new Date(m.timestamp).toLocaleString('th-TH', { calendar: 'gregory' }) : ''}] ${m.author?.username || 'user'}: ${m.content}`)
    .join('\n');

  if (!text.trim()) return [];

  const prompt = `หัวข้อเรื่องร้องเรียน: ${title}\n\nบทสนทนา:\n${text}`;
  let raw;
  try {
    raw = await callAI(await getPrompt('case.timeline', ctx), prompt, ctx);
  } catch (e) {
    console.error('[caseTimeline] AI error:', e.message);
    return [];
  }

  // parse JSON — strip markdown fences ถ้ามี
  const json = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    const events = JSON.parse(json);
    if (!Array.isArray(events)) return [];
    return events
      .filter(e => e?.body?.trim())
      .map(e => ({
        body: String(e.body).trim(),
        is_public: e.is_public === true,
        occurred_at: e.occurred_at || null,
      }));
  } catch {
    console.error('[caseTimeline] JSON parse failed:', json.slice(0, 200));
    return [];
  }
}

module.exports = { generateTimeline };
