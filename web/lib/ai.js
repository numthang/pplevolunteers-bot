/**
 * AI wrapper บางๆ ฝั่งเว็บ — ใช้ key เดียวกับบอท (`ANTHROPIC_API_KEY`)
 *
 * ต่างจาก `services/aiSummarize.js` ของบอทที่เลือก provider/model จาก backoffice (`db/aiConfig`):
 * posts ต้องการผลลัพธ์คงเส้นคงวา → **ปักโมเดลไว้ที่เดียวตรงนี้** (CLAUDE.md)
 *
 * โควตาต่อคนต่อวันอยู่ที่ `lib/postsAiQuota.js` ไม่ใช่ที่นี่ — ที่นี่ยิงอย่างเดียว
 */

export const AI_MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 8000          // ไทยกิน token เยอะ (~1 token/ตัวอักษร) — ซีรีส์ยาวต้องมี headroom
const TIMEOUT_MS = 120 * 1000

export class AiError extends Error {}

/**
 * ยิง Anthropic แล้วคืน text ล้วน
 * @param {string} system
 * @param {string} user
 * @param {{ model?: string, maxTokens?: number, orgId?: number }} [opts]
 *   orgId = องค์กรเจ้าของ key ที่จะยิง — **ทุก call site ต้องส่ง** (ยังไม่มีผลจนกว่าจะทำ BYO-key)
 *   model/maxTokens ปรับได้เฉพาะงานที่ไม่ใช่ posts (posts ปัก AI_MODEL ไว้ตามหัวไฟล์)
 */
export async function askAi(system, user, opts = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiError('ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY')

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: TIMEOUT_MS })

  let res
  try {
    res = await client.messages.create({
      model: opts.model || AI_MODEL,
      max_tokens: opts.maxTokens || MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: user }],
    })
  } catch (err) {
    throw new AiError(err?.message || 'เรียก AI ไม่สำเร็จ')
  }

  const text = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
  if (!text) throw new AiError('AI ไม่ได้ตอบอะไรกลับมา')
  return text
}

/**
 * เหมือน askAi แต่บังคับให้ผลเป็น JSON
 * โมเดลชอบห่อ ```json → ปอกให้ก่อน parse (เจอบ่อยพอที่จะกันไว้ ไม่ใช่ป้องกันเผื่อ)
 */
export async function askAiJson(system, user, opts = {}) {
  const raw = await askAi(`${system}\n\nตอบเป็น JSON ล้วนเท่านั้น ห้ามมีข้อความอื่นนอก JSON`, user, opts)
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    throw new AiError('AI ตอบกลับมาไม่ใช่ JSON ที่อ่านได้')
  }
}
