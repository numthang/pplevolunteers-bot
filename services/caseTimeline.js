// services/caseTimeline.js — AI timeline generation for cases
const { callAI } = require('./aiSummarize');

const AI_TIMELINE_SYSTEM = `วิเคราะห์บทสนทนา Discord แล้วสกัด event สำคัญออกมาเป็น timeline เรื่องร้องเรียน

กฎการสกัด:
- สกัดเฉพาะ event ที่เกิดขึ้นจริงหรือพูดถึงในบทสนทนา ห้ามแต่งเติม
- event ที่ควรสกัด: แจ้งปัญหา / นัดหมาย / ลงพื้นที่ / ส่งเรื่องต่อ / ติดตามผล / แก้ไขแล้ว / คำตอบจากหน่วยงาน
- ถ้าไม่มี event ที่ชัดเจนพอ ให้ return array ว่าง []
- occurred_at: ถ้าบทสนทนาระบุวันที่ให้แปลงเป็น ISO 8601 ไม่งั้นใส่ null

กฎ is_public (เผยแพร่ให้ประชาชนเห็นได้):
- true: ความคืบหน้าทั่วไป เช่น ลงพื้นที่ตรวจสอบแล้ว / ส่งเรื่องให้หน่วยงาน / แก้ไขแล้ว
- false: ชื่อ/เบอร์/ที่อยู่เต็มของบุคคล / นัดหมายภายในทีม / ความเห็นส่วนตัว / ข้อมูลที่กระทบบุคคลที่สาม

ตอบเป็น JSON array เท่านั้น ห้ามมี markdown หรือข้อความอื่น:
[{"body":"...","is_public":true,"occurred_at":"2026-01-05T10:00:00+07:00"}]`;

/**
 * Generate timeline events from Discord messages
 * messages = [{ id, content, author: { username, bot }, timestamp }]
 * Returns [{ body, is_public, occurred_at }] or []
 */
async function generateTimeline(title, messages) {
  const text = messages
    .filter(m => m.content?.trim() && !m.author?.bot)
    .map(m => `[${m.timestamp ? new Date(m.timestamp).toLocaleString('th-TH') : ''}] ${m.author?.username || 'user'}: ${m.content}`)
    .join('\n');

  if (!text.trim()) return [];

  const prompt = `หัวข้อเรื่องร้องเรียน: ${title}\n\nบทสนทนา:\n${text}`;
  let raw;
  try {
    raw = await callAI(AI_TIMELINE_SYSTEM, prompt);
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
