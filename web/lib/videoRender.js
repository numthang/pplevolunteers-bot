/**
 * สะพานไป `utils/videoQuoteOverlay.js` ที่ repo root — เบิร์นคำคมลงคลิปด้วย ffmpeg
 *
 * ใช้ `requireFromRoot` ตัวเดียวกับการ์ดคำคม (ดูเหตุผลยาวๆ ใน lib/quoteRender.js):
 * ห้ามให้ webpack แตะ เพราะปลายทาง require `@napi-rs/canvas` ของ **ราก** ไม่ใช่ของ web/
 *
 * ⚠️ ffmpeg รันเป็น child process → ไม่บล็อก event loop ของเว็บ แต่**กิน CPU จริง**
 *    เพดานความยาวคลิปคือตัวคุมต้นทุน ไม่ใช่ timeout
 */
import { resolve } from 'node:path'
import { REPO_ROOT } from './postsStorage.js'
import { requireFromRoot } from './quoteRender.js'

/**
 * เพดานความยาวคลิปที่ยอมเบิร์น (วินาที)
 *
 * 90 = เพดานของ Reels ทั้ง IG และ FB — ยาวกว่านี้โพสต์ไม่ออกอยู่ดี
 * ต้นทุนที่วัดได้บนเครื่องนี้: render ≈ 0.68 × ความยาวคลิป → 90 วิ ≈ 61 วิ
 * ⚠️ nginx ต้องมี `proxy_read_timeout` ≥ 300s ไม่งั้น request ถูกตัดกลางคัน
 */
export const MAX_BURN_SECONDS = 90
export const MAX_OVERLAY_TEXT = 300
export const POSITIONS = ['top', 'center', 'bottom']

export class VideoRenderError extends Error {}

let _mod = null
function mod() {
  if (!_mod) _mod = requireFromRoot('./utils/videoQuoteOverlay.js')
  return _mod
}

/** ตรวจค่าจาก client (อย่าเชื่อ client) */
export function normalizeBurnParams({ quoteText, authorName, position }) {
  const text = String(quoteText ?? '').trim()
  if (!text) throw new VideoRenderError('ยังไม่ได้ใส่ข้อความ')
  if (text.length > MAX_OVERLAY_TEXT) throw new VideoRenderError(`ข้อความยาวเกิน ${MAX_OVERLAY_TEXT} ตัวอักษร`)

  const author = String(authorName ?? '').trim()
  if (author.length > 35) throw new VideoRenderError('ชื่อยาวเกิน 35 ตัวอักษร')

  const pos = String(position ?? 'bottom').trim()
  if (!POSITIONS.includes(pos)) throw new VideoRenderError('ตำแหน่งข้อความไม่ถูกต้อง')

  return { quoteText: text, authorName: author, position: pos }
}

/**
 * ชั้นข้อความโปร่งใสใบเดียว (PNG) — **สำหรับพรีวิวใน modal**
 *
 * ⛔ ห้ามให้ฝั่ง client วาดข้อความเองด้วย CSS: `fitFont` ย่อฟอนต์ให้พอ 4 บรรทัดและตัดคำไทย
 *    แบบ grapheme-aware — `<div>` ในเบราว์เซอร์ให้ผลคนละอย่าง แล้วพรีวิวจะโกหก
 *    ตัวนี้ไม่แตะ ffmpeg เลย (canvas ล้วน ~200ms) จึงเรียกถี่ได้ไม่เปลือง
 */
export async function renderOverlayPng(width, height, params) {
  const { renderQuoteOverlay } = requireFromRoot('./utils/quoteStyles.js')
  try {
    return await renderQuoteOverlay(width, height, params)
  } catch (error) {
    console.error('[renderOverlayPng]', error)
    throw new VideoRenderError(`สร้างพรีวิวไม่สำเร็จ: ${error.message}`)
  }
}

/** อ่านสเปกคลิป (ขนาดที่ตาเห็น + ความยาว) — modal ใช้วางกรอบพรีวิวให้ตรงกับของจริง */
export async function probeVideoRel(relPath) {
  try {
    return await mod().probeVideo(resolve(REPO_ROOT, relPath))
  } catch (error) {
    throw new VideoRenderError(`อ่านคลิปไม่ได้: ${error.message}`)
  }
}

/**
 * เบิร์นคำคมลงคลิป → คืน path (relative จาก repo root) ของไฟล์ใหม่
 * @param {string} srcRelPath  คลิปต้นทาง
 * @param {string} outRelPath  ปลายทาง (ผู้เรียกเป็นคนตั้งชื่อ ให้ลงใน storage/posts เท่านั้น)
 */
export async function burnQuoteOnVideo(srcRelPath, outRelPath, params) {
  try {
    return await mod().renderVideoQuote({
      videoAbsPath: resolve(REPO_ROOT, srcRelPath),
      outAbsPath: resolve(REPO_ROOT, outRelPath),
      maxSeconds: MAX_BURN_SECONDS,
      ...params,
    })
  } catch (error) {
    console.error('[burnQuoteOnVideo]', error)
    throw new VideoRenderError(error.message)
  }
}
