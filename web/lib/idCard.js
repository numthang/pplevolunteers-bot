/**
 * สำเนาบัตรประชาชน — resize ให้พอดีพิมพ์ A4 + ลายน้ำกันใช้ผิดวัตถุประสงค์
 *
 * - processIdCardImage: รับไฟล์ upload → re-encode JPEG (strip EXIF) + ย่อให้ด้านยาวสุด ≤ MAX_EDGE
 *   เก็บลง dc_members.id_card_image (BYTEA). บัตร ISO ID-1 = 85.6×54mm ที่ 300dpi ≈ 1011×638px
 * - buildWatermarkedIdCard: เติมลายน้ำ "ใช้สำหรับพรรคประชาชนเท่านั้น" เอียง ~30° จาง
 *   + "สำเนาถูกต้อง" สีน้ำเงิน → JPEG สำหรับ embed ลง PDF
 */
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas'
import path from 'path'

const FONT = 'Anakotmai'
let fontReady = false
function ensureFont() {
  if (fontReady) return
  // process.cwd() = web/ ตอนรัน → ../assets/fonts (ตาม convention api/watermark/personal)
  GlobalFonts.registerFromPath(
    path.join(process.cwd(), '..', 'assets', 'fonts', 'Anakotmai-Bold.ttf'),
    FONT
  )
  fontReady = true
}

const MAX_EDGE   = 1011  // ด้านยาวสุด (px) — พอสำหรับพิมพ์บัตรบน A4 ที่ 300dpi
const JPEG_Q     = 82

/** ย่อ + re-encode เป็น JPEG (strip metadata). คืน Buffer สำหรับเก็บ DB */
export async function processIdCardImage(inputBuffer) {
  const img = await loadImage(inputBuffer)
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
  const W = Math.round(img.width * scale)
  const H = Math.round(img.height * scale)

  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, W, H)
  return canvas.toBuffer('image/jpeg', JPEG_Q)
}

/** เติมลายน้ำลงภาพบัตรที่เก็บไว้ → JPEG buffer สำหรับ embed PDF
 *  signatureBase64 (option) = ลายเซ็นรับรองสำเนาถูกต้อง วาดเหนือข้อความ "สำเนาถูกต้อง" */
export async function buildWatermarkedIdCard(storedBuffer, signatureBase64 = null) {
  ensureFont()
  const img = await loadImage(storedBuffer)
  const W = img.width, H = img.height
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  ctx.drawImage(img, 0, 0, W, H)

  // ── ลายน้ำเอียง ~30° จาง ครอบทั้งใบ (tiled) ──
  const wmFont = Math.round(Math.max(W, H) * 0.045)
  ctx.save()
  ctx.translate(W / 2, H / 2)
  ctx.rotate((-30 * Math.PI) / 180)
  ctx.font = `${wmFont}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(120,120,120,0.20)'
  const text = 'ใช้สำหรับพรรคประชาชนเท่านั้น'
  const stepY = wmFont * 2.4
  const stepX = ctx.measureText(text).width + wmFont * 2
  const diag = Math.ceil(Math.hypot(W, H) / 2)
  for (let y = -diag; y <= diag; y += stepY) {
    for (let x = -diag; x <= diag; x += stepX) {
      ctx.fillText(text, x, y)
    }
  }
  ctx.restore()

  // ── "สำเนาถูกต้อง" สีน้ำเงินหมึกปากกา มุมล่าง ──
  const stampFont = Math.round(Math.max(W, H) * 0.055)
  ctx.font = `${stampFont}px ${FONT}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = '#1a47cc'
  ctx.fillText('สำเนาถูกต้อง', W - stampFont * 0.5, H - stampFont * 0.5)

  // ── ลายเซ็นรับรองสำเนา วาดเหนือข้อความ (ถ้ามี) ──
  if (signatureBase64) {
    try {
      const sigBuf = Buffer.from(signatureBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
      const sig = await loadImage(sigBuf)
      const sigW = Math.round(W * 0.28)
      const sigH = Math.round(sigW * (sig.height / sig.width))
      const sigX = W - stampFont * 0.5 - sigW
      const sigY = H - stampFont * 0.5 - stampFont * 1.2 - sigH
      ctx.drawImage(sig, sigX, sigY, sigW, sigH)
    } catch { /* ลายเซ็นพังไม่ควรล้มทั้งใบ */ }
  }

  return canvas.toBuffer('image/jpeg', 90)
}
