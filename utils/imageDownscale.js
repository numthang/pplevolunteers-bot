// utils/imageDownscale.js — ย่อรูปให้อยู่ในกรอบ **ก่อนเก็บลงดิสก์และก่อนยิงขึ้นแพลตฟอร์ม**
//
// ทำไมต้องมี (เหตุจริง 2026-09-05 · โพสต์ 1051):
//   การ์ดคำคมเรนเดอร์เท่าขนาดรูปพื้นหลัง → พื้นหลัง 6936×8670 (60 ล้านพิกเซล) ได้ PNG 35 MB
//   ติดลายน้ำแล้ว re-encode เป็น PNG อีกรอบ = 60 MB → **ทุกแพลตฟอร์มล้มพร้อมกัน**
//   (X 15 MB · FB "reduce the amount of data" · IG/Threads ดาวน์โหลดไม่ทันจน timeout ·
//    ห้องข่าว Discord 10 MB = 413 Request entity too large)
//   ก่อนหน้านี้ทั้งท่อไม่เคยย่ออะไรเลย มีแค่เพดาน **ขนาดไฟล์ขาเข้า** 12 MB ซึ่งไฟล์ jpeg 60 MP ผ่านสบาย
//
// กติกา:
//   - ไม่ขยายรูปเล็ก · รูปที่อยู่ในกรอบอยู่แล้วคืน buffer เดิมทั้งดุ้น (changed:false) ไม่ re-encode ทิ้งคุณภาพ
//   - gif/วิดีโอ/เสียง = ไม่แตะ (sharp จะทำ gif เคลื่อนไหวพัง)
//   - png ที่มี alpha คง png ไว้ (การ์ดพื้นโปร่ง) · นอกนั้นเกินเพดานไบต์เมื่อไหร่ → jpeg
const MAX_EDGE = 2048;          // ด้านยาวสุด — IG ใช้จริง 1080, FB แนะนำ 2048, X รับ 4096
const MAX_BYTES = 4 * 1024 * 1024;   // เพดานไบต์ที่ทุกแพลตฟอร์มรับแน่ๆ (ต่ำสุดคือ X 5 MB)
const JPEG_QUALITY = 88;
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);

const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MIME_BY_EXT = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

function normalizeExt(ext) {
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  return e === 'jpeg' ? 'jpg' : e;
}

/** รูปที่ย่อได้ไหม (ตัดสินจาก ext หรือ mime อย่างใดอย่างหนึ่ง) */
function isShrinkableImage(extOrMime) {
  const v = String(extOrMime || '').toLowerCase();
  const ext = v.includes('/') ? EXT_BY_MIME[v] : normalizeExt(v);
  return IMAGE_EXTS.has(ext || '');
}

/**
 * ย่อ/บีบรูปให้ไม่เกิน maxEdge px และ maxBytes ไบต์
 *
 * @param {Buffer} buffer
 * @param {{ext?:string, mime?:string, maxEdge?:number, maxBytes?:number, quality?:number}} opts
 * @returns {Promise<{buffer:Buffer, ext:string, mime:string, changed:boolean}>}
 *          ext/mime อาจ **เปลี่ยน** (png/webp → jpg) — ผู้เรียกต้องใช้ค่าที่คืนมาตั้งชื่อไฟล์เสมอ
 */
async function shrinkImage(buffer, {
  ext = null, mime = null, maxEdge = MAX_EDGE, maxBytes = MAX_BYTES, quality = JPEG_QUALITY,
  keepFormat = false,
} = {}) {
  const inExt = normalizeExt(ext) || EXT_BY_MIME[String(mime || '').toLowerCase()] || null;
  const unchanged = { buffer, ext: inExt, mime: mime || MIME_BY_EXT[inExt] || null, changed: false };

  if (!Buffer.isBuffer(buffer) || !buffer.length) return unchanged;
  if (!isShrinkableImage(inExt || mime)) return unchanged;   // gif/คลิป/เสียง → ปล่อยผ่าน

  try {
    const sharp = require('sharp');
    const meta = await sharp(buffer, { failOn: 'none' }).metadata();

    // ⚠️ sharp 0.34 metadata() คืนขนาด **ก่อนหมุนตาม EXIF** — orientation 5-8 คือรูปตะแคง
    //    ต้องสลับ w/h เองก่อนคำนวณ ไม่งั้นรูปแนวตั้งจากมือถือคำนวณด้านยาวผิด (cerebrum bug-462)
    const rotated = (meta.orientation || 0) >= 5;
    const w = rotated ? meta.height : meta.width;
    const h = rotated ? meta.width : meta.height;
    if (!w || !h) return unchanged;

    const tooWide = w > maxEdge || h > maxEdge;
    const tooHeavy = buffer.length > maxBytes;
    if (!tooWide && !tooHeavy) return unchanged;   // อยู่ในกรอบแล้ว — ห้าม re-encode ทิ้งคุณภาพฟรีๆ

    // keepFormat = ห้ามเปลี่ยนนามสกุล (ตัวไล่ย่อไฟล์เก่าใช้ตอนไม่อยากแตะ path ใน DB)
    const keepPng = inExt === 'png' && (meta.hasAlpha || keepFormat);
    const keepWebp = inExt === 'webp' && keepFormat;
    const outExt = keepPng ? 'png' : keepWebp ? 'webp' : 'jpg';

    // ย่อทีละขั้นจนได้ไบต์ตามเพดาน — ขั้นแรกคือ maxEdge ตรงๆ
    // (png โปร่งใสบีบไม่ได้เท่า jpeg จึงต้องมีขั้นถัดไปเผื่อไว้)
    let out = null;
    for (const edge of [maxEdge, Math.round(maxEdge * 0.7), Math.round(maxEdge * 0.5)]) {
      let pipe = sharp(buffer, { failOn: 'none' }).rotate();   // rotate() = auto-orient ตาม EXIF
      if (w > edge || h > edge) pipe = pipe.resize(edge, edge, { fit: 'inside', withoutEnlargement: true });
      out = keepPng ? await pipe.png({ compressionLevel: 9 }).toBuffer()
        : keepWebp ? await pipe.webp({ quality }).toBuffer()
        : await pipe.jpeg({ quality, mozjpeg: true }).toBuffer();
      if (out.length <= maxBytes) break;
    }

    // ย่อแล้วโตกว่าเดิม (รูปเล็กที่หนักเพราะ noise) → เก็บของเดิมไว้ดีกว่า
    if (!out || (out.length >= buffer.length && !tooWide)) return unchanged;

    return { buffer: out, ext: outExt, mime: MIME_BY_EXT[outExt], changed: true };
  } catch (err) {
    // ย่อไม่สำเร็จต้องไม่ทำให้อัปโหลด/โพสต์ล้ม — ของเดิมยังใช้ได้ แค่ใหญ่
    console.error('[imageDownscale] ย่อรูปไม่สำเร็จ:', err.message);
    return unchanged;
  }
}

module.exports = { shrinkImage, isShrinkableImage, MAX_EDGE, MAX_BYTES, JPEG_QUALITY };
