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

/** trim ลายเซ็นเฉพาะรอยหมึก แล้ว fit ลงกล่องมาตรฐานคงที่ (โปร่งใส) → PNG buffer
 *  ทำให้ทุกลายเซ็น (เก่า/ใหม่ วาดเล็ก/ใหญ่/มุมไหน) ออกมาขนาด+สัดส่วนเท่ากันเสมอ
 *  คืน null ถ้าไม่มีหมึก */
export async function normalizeSignature(base64, outW = 360, outH = 120, pad = 8) {
  try {
    const buf = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    const img = await loadImage(buf)
    const W = img.width, H = img.height
    const scan = createCanvas(W, H)
    const sctx = scan.getContext('2d')
    sctx.drawImage(img, 0, 0)
    const { data } = sctx.getImageData(0, 0, W, H)
    let minX = W, minY = H, maxX = -1, maxY = -1
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (data[(y * W + x) * 4 + 3] > 10) {        // alpha > 10 = มีหมึก
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) return null                          // ไม่มีหมึก
    const bw = maxX - minX + 1, bh = maxY - minY + 1
    const out = createCanvas(outW, outH)
    const octx = out.getContext('2d')
    const scale = Math.min((outW - pad * 2) / bw, (outH - pad * 2) / bh)
    const dw = bw * scale, dh = bh * scale
    octx.drawImage(scan, minX, minY, bw, bh, (outW - dw) / 2, (outH - dh) / 2, dw, dh)
    return out.toBuffer('image/png')
  } catch {
    // normalize พัง → fallback ใช้รูปเดิม (ลายเซ็นไม่หาย)
    try { return Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64') } catch { return null }
  }
}

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

/** เติมลายน้ำลงภาพบัตรที่เก็บไว้ → JPEG buffer สำหรับ embed PDF (เฉพาะลายน้ำ ไม่มีลายเซ็น/สแตมป์) */
export async function buildWatermarkedIdCard(storedBuffer) {
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

  return canvas.toBuffer('image/jpeg', 90)
}

/** บล็อก "ลายเซ็น + สำเนาถูกต้อง" สำหรับวางใต้ภาพบัตร → PNG โปร่งใส (วางบน A4 ขาวได้พอดี)
 *  คืน { png, width, height } เพื่อให้ผู้เรียก scale ตามสัดส่วน */
export async function buildCertifyBlock(sigBuffer = null) {
  ensureFont()
  const W = 700, H = 320
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  // ลายเซ็น (normalize มาแล้ว สัดส่วน 3:1) — กลางบน
  if (sigBuffer) {
    try {
      const sig = await loadImage(sigBuffer)
      const sigW = 320
      const sigH = Math.min(170, Math.round(sigW * (sig.height / sig.width)))
      ctx.drawImage(sig, (W - sigW) / 2, 20, sigW, sigH)
    } catch { /* ลายเซ็นพังไม่ควรล้มทั้งใบ */ }
  }

  // "สำเนาถูกต้อง" สีน้ำเงินหมึกปากกา — กลางล่าง ใต้ลายเซ็น
  ctx.font = `54px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = '#1a47cc'
  ctx.fillText('สำเนาถูกต้อง', W / 2, H - 24)

  return { png: canvas.toBuffer('image/png'), width: W, height: H }
}
