/**
 * AI wrapper บางๆ ฝั่งเว็บ — ใช้ key เดียวกับบอท (`ANTHROPIC_API_KEY`)
 *
 * ต่างจาก `services/aiSummarize.js` ของบอทที่เลือก provider/model จาก backoffice (`db/aiConfig`):
 * posts ต้องการผลลัพธ์คงเส้นคงวา → **ปักโมเดลไว้ที่เดียวตรงนี้** (CLAUDE.md)
 *
 * โควตาต่อคนต่อวันอยู่ที่ `lib/postsAiQuota.js` ไม่ใช่ที่นี่ — ที่นี่ยิงอย่างเดียว
 */

import { getAiCreds, AiCredsError } from './aiCreds.js'

export { AiCredsError }

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
  // key/โมเดลของ org นี้ — ไม่มี key ของตัวเอง = ยืม key กลางตามโควตา (โยน AiCredsError ถ้าหมด)
  // opts.model ที่ส่งมาเป็นแค่ "ค่าตั้งต้นของงานนี้" — org ที่จ่ายเองเลือกทับได้
  let creds
  try {
    creds = await getAiCreds({
      orgId: opts.orgId ?? null,
      task: opts.task === 'light' ? 'light' : 'writing',
      legacy: { model: opts.model || AI_MODEL },
    })
  } catch (err) {
    // แปลงเป็น AiError เพื่อให้ route ที่ catch อยู่แล้วจับได้ — พก code ต่อไปให้ตอบ 429 ตอนโควตาหมด
    if (err instanceof AiCredsError) throw Object.assign(new AiError(err.message), { code: err.code })
    throw err
  }
  if (creds.provider !== 'claude') {
    throw new AiError('งานนี้รองรับเฉพาะ Claude — เปลี่ยนค่ายที่ ตั้งค่าองค์กร > AI หรือใส่ API key ของ Claude')
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: creds.apiKey, timeout: TIMEOUT_MS })

  let res
  try {
    res = await client.messages.create({
      model: creds.model,
      max_tokens: opts.maxTokens || MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: user }],
    })
  } catch (err) {
    // ห้ามโยน err.message ดิบ — error บางแบบของ SDK echo header/คีย์กลับมาด้วย
    console.error('[askAi]', creds.source, err?.status || '', err?.message)
    throw new AiError('เรียก AI ไม่สำเร็จ — ตรวจ API key ขององค์กรหรือลองใหม่อีกครั้ง')
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
