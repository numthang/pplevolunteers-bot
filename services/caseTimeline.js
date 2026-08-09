// services/caseTimeline.js — AI timeline generation for cases
const { callAI } = require('./aiSummarize');

const AI_TIMELINE_SYSTEM = `วิเคราะห์บทสนทนา Discord แล้วสกัด event สำคัญออกมาเป็น timeline เรื่องร้องเรียน

กฎการสกัด:
- สกัดเฉพาะ event ที่เกิดขึ้นจริงหรือพูดถึงในบทสนทนา ห้ามแต่งเติม
- event ที่ควรสกัด: แจ้งปัญหา / นัดหมาย / ลงพื้นที่ / ส่งเรื่องต่อ / ติดตามผล / แก้ไขแล้ว / คำตอบจากหน่วยงาน
- ถ้าไม่มี event ที่ชัดเจนพอ ให้ return array ว่าง []
- occurred_at: ถ้าบทสนทนาระบุวันที่ให้แปลงเป็น ISO 8601 **ปี ค.ศ. (Gregorian) เท่านั้น** ไม่งั้นใส่ null
- body: สรุปให้ครบใจความ (เหตุ → ดำเนินการ → ผลลัพธ์) ไม่ต้องรวบสั้นจนขาดบริบทที่จำเป็น เขียนได้ 1-3 ประโยคถ้าเรื่องซับซ้อน

กฎ is_public (เผยแพร่ให้ประชาชนเห็นได้):
- true: ความคืบหน้าทั่วไป เช่น ลงพื้นที่ตรวจสอบแล้ว / ส่งเรื่องให้หน่วยงาน / แก้ไขแล้ว
- false: ชื่อ/เบอร์/ที่อยู่เต็มของบุคคล / นัดหมายภายในทีม / ความเห็นส่วนตัว / ข้อมูลที่กระทบบุคคลที่สาม

ตอบเป็น JSON array เท่านั้น ห้ามมี markdown หรือข้อความอื่น:
[{"body":"...","is_public":true,"occurred_at":"2026-01-05T10:00:00+07:00"}]`;

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
    raw = await callAI(AI_TIMELINE_SYSTEM, prompt, ctx);
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
