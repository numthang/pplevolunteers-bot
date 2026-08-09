// services/aiLayout.js
// ย่อข้อความ quote ด้วย AI — ใช้โดยสคริปต์ทดสอบเท่านั้น (scripts/media/testQuoteTemplates.js)
//
// ⛔ analyzeLayout (AI เลือกตำแหน่ง+สีให้การ์ดคำคม) ถอดออก 2026-08-10
//    เหตุผล: AI ตัดสินแค่ band/align/สี ซึ่งคนเลือกเองอยู่แล้วจากเมนู 26 สไตล์ + ปุ่มสุ่ม
//    อย่าใส่กลับโดยไม่ถามก่อน

const SHORTEN_SYSTEM = `คุณคือผู้ช่วยย่อ quote สำหรับ overlay บนภาพ

งาน: ย่อ quote เป็น 3-4 บรรทัด แต่ละบรรทัดไม่เกิน 22 ตัวอักษร อ่านรู้เรื่องเป็นประโยคสมบูรณ์

หลักการ:
- คัดใจความหลักของต้นฉบับ — ห้ามเพิ่มความหมายที่ไม่มีในต้นฉบับ
- แต่ละบรรทัดต้องอ่านรู้เรื่องด้วยตัวเอง ปรับคำให้เป็นธรรมชาติได้
- เรียงจากสั้น (บรรทัดแรก) ไปยาว (บรรทัดสุดท้าย) ค่อยๆ ยาวขึ้น ต่างกันไม่เกิน 4 ตัวอักษร
- ตอบเฉพาะข้อความคั่นด้วย newline เท่านั้น ห้ามอธิบาย ห้ามเครื่องหมายคำพูด

ตัวอย่าง:
input: "ผมทำงานอาสามาสิบปีแล้ว ทุกครั้งที่ออกไปช่วยชุมชนรู้สึกว่าตัวเองได้อะไรกลับมามากกว่าที่ให้ออกไป เพราะมันทำให้เราเห็นคุณค่าของตัวเองและเชื่อมต่อกับคนอื่นได้จริงๆ"
output:
ทำงานอาสามาสิบปี
ได้รับมากกว่าที่ให้
เห็นคุณค่าของตัวเอง
เชื่อมต่อกับคนได้จริงๆ`;

/**
 * ย่อข้อความ quote ให้พอดีกับ overlay — เรียกเมื่อ text.length > 80
 * @param {string} text
 * @returns {Promise<string>}
 */
async function shortenQuote(text, provider = 'claude') {
  try {
    let shortened;
    if (provider === 'gemini') {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model  = client.getGenerativeModel({ model: 'gemini-2.0-flash', systemInstruction: SHORTEN_SYSTEM });
      const result = await model.generateContent(text);
      shortened = result.response.text().trim();
    } else {
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
      const res = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        system: SHORTEN_SYSTEM,
        messages: [{ role: 'user', content: text }],
      });
      shortened = res.content.find(b => b.type === 'text')?.text?.trim() || text;
    }
    console.log('[shortenQuote]', JSON.stringify(text), '→', JSON.stringify(shortened));
    return shortened || text;
  } catch (err) {
    console.error('[shortenQuote] error, using original:', err.message);
    return text;
  }
}

module.exports = { shortenQuote };
