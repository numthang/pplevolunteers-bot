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
// ไทยกิน token เยอะ (~1 token/ตัวอักษร) — ซีรีส์เนื้อหาเต็มทุกตอนกิน token มากกว่าที่ 8000 เดิมรองรับไหว
// 8000 → โดนตัดกลางคัน (stop_reason: max_tokens) JSON ขาดครึ่ง · 32000 → พอ แต่ generate นานจน request
// วิ่งเกิน timeout ของ nginx บน prod · 16000 = จุดที่พอสำหรับ 6 ตอน (ดู MAX_EPISODES) โดยไม่ลากยาวเกินไป
const MAX_TOKENS = 16000
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
    // .stream().finalMessage() ไม่ใช่ .create() ตรงๆ — max_tokens สูง (32000) ต้อง stream กัน SDK
    // hit HTTP timeout เอง (เกิน ~16000 แบบไม่ stream เสี่ยงมาก อ้างอิงเอกสาร Anthropic)
    res = await client.messages.stream({
      model: creds.model,
      max_tokens: opts.maxTokens || MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: user }],
    }).finalMessage()
  } catch (err) {
    // ห้ามโยน err.message ดิบ — error บางแบบของ SDK echo header/คีย์กลับมาด้วย
    console.error('[askAi]', creds.source, err?.status || '', err?.message)
    throw new AiError('เรียก AI ไม่สำเร็จ — ตรวจ API key ขององค์กรหรือลองใหม่อีกครั้ง')
  }

  // โดนตัดกลางคันเพราะ max_tokens ไม่พอ — ต้องเช็คก่อน parse ไม่งั้น error ที่ user เห็นคือ
  // "AI ตอบกลับมาไม่ใช่ JSON ที่อ่านได้" ซึ่งงงว่าเกิดจากอะไร ทั้งที่จริงคือเนื้อหายาวเกิน max_tokens
  if (res.stop_reason === 'max_tokens') {
    // พก code ไปด้วย — ข้อความนี้เขียนไว้สำหรับ posts (ตอน/episodes) ถ้าโมดูลอื่นเรียกแล้ว
    // โชว์ดิบๆ จะอ่านไม่รู้เรื่อง (เคสจริง: หน้า timeline เคสขึ้นว่า "ลดจำนวนตอน")
    // → ผู้เรียกที่อยากได้ถ้อยคำของตัวเองให้เช็ค err.code === 'max_tokens'
    throw Object.assign(new AiError('เนื้อหาที่ AI สร้างยาวเกินไป ลองย่อไอเดียหรือลดจำนวนตอนก่อน'), { code: 'max_tokens' })
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

// OCR บัตรประชาชน — ปักโมเดลแยกจาก AI_MODEL ด้านบน
// อ่านผิด 1 ตัวแล้วเนียน = เลขบัตร/ที่อยู่ผิดไปอยู่บนเอกสารการเงินที่ส่งกองทุน
// บัตร 1 ใบ ≈ 2,000 input token → ส่วนต่างค่าโมเดลต่อใบไม่ถึงบาท ไม่คุ้มที่จะลดรุ่นแลกความแม่น
export const VISION_MODEL = 'claude-opus-5'

/**
 * เหมือน askAiJson แต่แนบรูปไปด้วย (vision) — คืน object ที่ parse แล้ว
 * @param {Buffer} imageBuffer  รูปที่ย่อ/แปลงเป็น JPEG แล้ว (ดู processIdCardImage)
 *
 * ⚠️ รูปถูกส่งออกไปที่ผู้ให้บริการ AI — เรียกเฉพาะตอนสร้างผู้รับใหม่จริงๆ
 *    คนเดิมที่มีในระบบแล้วห้ามยิงซ้ำ (ทั้งเปลืองและส่งข้อมูลบัตรออกโดยไม่จำเป็น)
 */
export async function askAiVisionJson(system, user, imageBuffer, opts = {}) {
  let creds
  try {
    creds = await getAiCreds({
      orgId: opts.orgId ?? null,
      task: 'writing',
      legacy: { model: opts.model || VISION_MODEL },
    })
  } catch (err) {
    if (err instanceof AiCredsError) throw Object.assign(new AiError(err.message), { code: err.code })
    throw err
  }
  if (creds.provider !== 'claude') {
    throw new AiError('การอ่านบัตรรองรับเฉพาะ Claude — เปลี่ยนค่ายที่ ตั้งค่าองค์กร > AI หรือใส่ API key ของ Claude')
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: creds.apiKey, timeout: TIMEOUT_MS })

  let res
  try {
    res = await client.messages.create({
      model: creds.model,
      max_tokens: opts.maxTokens || 2000,
      system: `${system}\n\nตอบเป็น JSON ล้วนเท่านั้น ห้ามมีข้อความอื่นนอก JSON`,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBuffer.toString('base64') } },
          { type: 'text', text: user },
        ],
      }],
    })
  } catch (err) {
    console.error('[askAiVisionJson]', creds.source, err?.status || '', err?.message)
    throw new AiError('อ่านรูปบัตรไม่สำเร็จ — ลองใหม่อีกครั้ง หรือกรอกข้อมูลเอง')
  }

  const raw = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    throw new AiError('อ่านบัตรแล้วแต่ผลลัพธ์ไม่สมบูรณ์ — กรอกข้อมูลเองได้เลย')
  }
}
