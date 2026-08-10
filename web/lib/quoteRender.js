/**
 * สะพานไปหา renderer ของบอท — `utils/quoteStyles.js` ที่ **repo root**
 *
 * ⛔ ห้าม copy/เขียน renderer ใหม่ฝั่งเว็บ (กติกาข้อ 16 ใน md/posts/POSTS.md)
 *    ไม่งั้นได้การ์ด 2 หน้าตาที่ค่อยๆ เพี้ยนจากกัน
 *
 * ⚠️ ใช้ createRequire แทน `import` ตรงๆ โดยตั้งใจ — 2 เหตุผล ห้ามเปลี่ยนเป็น import:
 *
 * 1. **webpack ห้ามแตะไฟล์นี้** — `utils/quoteStyles.js` → `services/aiLayout.js` ซึ่ง require
 *    `@google/generative-ai` ที่ **ไม่มีใน `web/package.json`** (มีแต่ฝั่งบอท)
 *    ถ้าปล่อยให้ bundle จะ Module not found ตอน `next build`
 *
 * 2. **ต้อง resolve จาก repo root เท่านั้น** — `web/node_modules/@napi-rs/canvas` เป็น **1.0.0**
 *    ที่ `loadImage(<absolute path>)` โยน `ERR_INVALID_URL` ทั้งดุ้น ส่วนของราก 0.1.97 ใช้ได้
 *    createRequire ที่ปักหมุดไว้ที่รากทำให้ `require('@napi-rs/canvas')` ข้างใน quoteStyles
 *    วิ่งขึ้นไปเจอของรากเสมอ (ดู md/posts/POSTS.md §ผลตรวจ /scrutinize)
 */
import { resolve } from 'node:path'
import { REPO_ROOT } from './postsStorage.js'
import {
  QUOTE_STYLE_KEYS, QUOTE_STYLE_OPTIONS, normalizeStyle,
  plainSizeOf, PLAIN_SIZES_BY_ASPECT, DEFAULT_ASPECT,
  isPlainStyle, plainBgOf, isPlainFont, isPlainTextSize,
} from './quoteStyles.js'

/**
 * ⛔ ห้ามเปลี่ยนเป็น `import { createRequire } from 'node:module'`
 * webpack ของ Next แทนที่ createRequire ที่ import มาด้วย stub แล้วพังตอน runtime
 * ("module.createRequire failed parsing argument" ตอน build → `requireFromRoot is not a function")
 * `process.getBuiltinModule` เป็นแค่ property access ที่ webpack วิเคราะห์ไม่ได้ → ได้ของจริงจาก Node
 */
export function requireFromRoot(modPath) {
  return nodeRequireFromRoot()(modPath)
}

function nodeRequireFromRoot() {
  if (typeof process.getBuiltinModule !== 'function') {
    throw new QuoteRenderError('ต้องใช้ Node 22.3+ ขึ้นไป (process.getBuiltinModule)')
  }
  const { createRequire } = process.getBuiltinModule('node:module')
  // ปักหมุดที่ package.json ของราก → resolve จากรากเสมอ ไม่ขึ้นกับ cwd
  return createRequire(resolve(REPO_ROOT, 'package.json'))
}

// โหลดตอนเรียกจริง ไม่ใช่ตอน import โมดูล — native binary จะได้ไม่ถูกแตะตอน build/collect page data
let _renderer = null
function renderer() {
  if (!_renderer) _renderer = nodeRequireFromRoot()('./utils/quoteStyles.js')
  return _renderer
}

/** ระดับความอิ่มสีที่ UI ให้เลือก — ค่าเดียวกับ COLOR_OPTIONS ใน handlers/quoteHandler.js */
export const SATURATION_CHOICES = [
  { value: 1.0, label: 'สี' },
  { value: 0.55, label: 'กลาง' },
  { value: 0.15, label: 'ขาวดำ' },
]

export const MAX_QUOTE_LEN = 300     // เท่ากับ modal ของบอท (TextInput maxLength)
export const MAX_AUTHOR_LEN = 35

export class QuoteRenderError extends Error {}

/**
 * ตรวจ + normalize ค่าที่รับมาจาก client (อย่าเชื่อ client)
 * @returns {{quoteText:string, authorName:string, style:string, saturation:number|null}}
 */
export function normalizeQuoteParams({ quoteText, authorName, style, saturation, font, textSize, aspect }) {
  const text = String(quoteText ?? '').trim()
  if (!text) throw new QuoteRenderError('ยังไม่ได้ใส่ข้อความ')
  if (text.length > MAX_QUOTE_LEN) throw new QuoteRenderError(`ข้อความยาวเกิน ${MAX_QUOTE_LEN} ตัวอักษร`)

  const author = String(authorName ?? '').trim()
  if (author.length > MAX_AUTHOR_LEN) throw new QuoteRenderError(`ชื่อยาวเกิน ${MAX_AUTHOR_LEN} ตัวอักษร`)

  // การ์ดไม่มีรูป — คีย์ `plain-*` ไม่ได้อยู่ใน QUOTE_STYLE_KEYS โดยตั้งใจ (ดู lib/quoteStyles.js)
  // จึงต้องแยกสาขาก่อน · ไม่มีรูป = ไม่มีอะไรให้ปรับความอิ่มสี → saturation ตกไปเสมอ
  const plainRaw = String(style ?? '').trim()
  if (isPlainStyle(plainRaw)) {
    if (!plainBgOf(plainRaw)) throw new QuoteRenderError('ไม่รู้จักสไตล์นี้')
    // ฟอนต์/ขนาด: ค่าที่ไม่รู้จัก **ตกเป็น default เงียบๆ ไม่ throw** — มันเป็นความสวยงาม
    // ไม่ใช่ความถูกต้อง (ต่างจากสไตล์ที่ผิดแล้วเรนเดอร์ไม่ออก) การ์ดยังออกมาใช้ได้
    const f = String(font ?? '').trim()
    const ts = String(textSize ?? '').trim()
    const ar = String(aspect ?? '').trim()
    return {
      quoteText: text, authorName: author, style: plainRaw, saturation: null,
      font: isPlainFont(f) ? f : 'anakotmai',
      textSize: isPlainTextSize(ts) ? ts : 'm',
      aspect: PLAIN_SIZES_BY_ASPECT[ar] ? ar : DEFAULT_ASPECT,
    }
  }

  // ไม่ส่งสไตล์มา = 'random' (renderQuoteStyle สุ่มให้เอง โดยไม่แตะ AI)
  // normalizeStyle ก่อนเช็ค — การ์ดที่บันทึกไว้ก่อน rename 2026-08-07 เก็บคีย์เก่าใน
  // post_episode_media.quote_style ถ้าไม่แปลงจะเรนเดอร์ซ้ำไม่ได้ ขึ้น 'ไม่รู้จักสไตล์นี้'
  const styleKey = normalizeStyle(String(style ?? '').trim() || 'random')
  if (!QUOTE_STYLE_KEYS.includes(styleKey)) throw new QuoteRenderError('ไม่รู้จักสไตล์นี้')

  // null = ปล่อยให้ AI ตัดสิน (เฉพาะสไตล์ AI) · สไตล์ปกติ null → renderer ใช้ default ของมันเอง
  let sat = null
  if (saturation !== null && saturation !== undefined && saturation !== '') {
    sat = Number(saturation)
    if (!Number.isFinite(sat) || sat < 0 || sat > 1) throw new QuoteRenderError('ค่าความอิ่มสีไม่ถูกต้อง')
  }

  return { quoteText: text, authorName: author, style: styleKey, saturation: sat }
}

/**
 * render การ์ดคำคม 1 ใบ
 * @param {Buffer} bgBuffer  รูปพื้นหลัง (ครอปมาแล้วจากฝั่ง client — renderer คำนวณ layout จากขนาดภาพ
 *                           จึง **ต้องครอปก่อน render เสมอ** เหมือนที่ quoteHandler.js:329 ทำ)
 * @param {string|null} accentColor  สี CI '#rrggbb' — resolveQuoteAccent() หามาให้
 * @returns {Promise<Buffer>} PNG
 */
export async function renderQuoteCard(bgBuffer, params, accentColor = null) {
  const { quoteText, authorName, style, saturation } = params
  // null เข้า sharp จะโยน "Expected number above zero for saturation" → default 1.0 (สีเต็ม)
  const sat = saturation ?? 1.0
  try {
    const { buffer } = await renderer().renderQuoteStyle(style, bgBuffer, {
      quoteText,
      authorName,
      saturation: sat,
      // สี CI ของผู้ใช้/องค์กร — null = renderer ใช้ส้ม default (ดู lib/quoteAccent.js)
      accentColor: accentColor || undefined,
    })
    return buffer
  } catch (error) {
    console.error('[renderQuoteCard]', error)
    throw new QuoteRenderError(`สร้างการ์ดไม่สำเร็จ: ${error.message}`)
  }
}

/**
 * render การ์ดคำคม **แบบไม่มีรูป** — พื้นเป็นสี CI
 *
 * แยกจาก renderQuoteCard เพราะ renderer คนละตัว (`renderPlain` ไม่รับ buffer)
 * ขนาดตรึงที่ 4:5 — ไม่มีรูปให้เอาสัดส่วนมา และ user เคาะว่าเอาขนาดเดียวพอ
 *
 * @param {string|null} watermarkPath  path **สัมบูรณ์** ของไฟล์ลายน้ำ (สไตล์ plain-logo เท่านั้น)
 *                                     ผู้เรียกต้อง whitelist มาก่อนแล้ว — ที่นี่ไม่ตรวจ path
 */
export async function renderPlainCard(params, accentColor = null, watermarkPath = null) {
  try {
    const { buffer } = await renderer().renderPlain({
      quoteText: params.quoteText,
      authorName: params.authorName,
      bg: plainBgOf(params.style),
      font: params.font,
      textSize: params.textSize,
      accentColor: accentColor || undefined,
      watermarkPath,
      ...plainSizeOf(params.aspect),
    })
    return buffer
  } catch (error) {
    console.error('[renderPlainCard]', error)
    throw new QuoteRenderError(`สร้างการ์ดไม่สำเร็จ: ${error.message}`)
  }
}

export { QUOTE_STYLE_OPTIONS, QUOTE_STYLE_KEYS, isPlainStyle }
