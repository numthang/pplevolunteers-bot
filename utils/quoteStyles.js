// utils/quoteStyles.js — Quote image styles
const sharp  = require('sharp');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path   = require('path');
const fs     = require('fs');

GlobalFonts.registerFromPath(
  path.join(__dirname, '..', 'assets', 'fonts', 'Anakotmai-Bold.ttf'),
  'Anakotmai'
);
GlobalFonts.registerFromPath(
  path.join(__dirname, '..', 'assets', 'fonts', 'Anakotmai-Light.ttf'),
  'AnakotmaiLight'
);
// Google Sans (มีหัว) — สำหรับ quote-2-center. family ไม่ซ้ำ Anakotmai ที่ติดตั้งในเครื่อง
GlobalFonts.registerFromPath(
  path.join(__dirname, '..', 'assets', 'fonts', 'GoogleSans-Bold.ttf'),
  'GSans'
);
// TH Sarabun (มีหัว ทรงราชการ) — ตัวเลือกฟอนต์ของการ์ดคำคมแบบไม่มีรูป
GlobalFonts.registerFromPath(
  path.join(__dirname, '..', 'assets', 'fonts', 'THSarabunNew-Bold.ttf'),
  'Sarabun'
);
GlobalFonts.registerFromPath(
  path.join(__dirname, '..', 'assets', 'fonts', 'GoogleSans-Regular.ttf'),
  'GSansLight'
);

const QUOTE_DIR = path.join(__dirname, '..', 'assets', 'quote');
const markCache = {};

// bug-079: ชื่อใน pool ที่ไม่มีไฟล์จริงทำให้ loadImage() ตกไป branch "โหลดจาก remote URL"
// แล้วโยน ERR_INVALID_URL ที่อ่านไม่ออกว่าเป็นเพราะไฟล์หาย (classic_open/classic_close หายไปจาก
// assets/quote/ → quote พังแบบสุ่ม 25%) → เช็คก่อนเสมอ แล้วบอกให้ตรงว่าไฟล์ไหนหาย
const markExistsCache = {};
function markExists(name) {
  if (markExistsCache[name] === undefined) {
    markExistsCache[name] = fs.existsSync(path.join(QUOTE_DIR, `${name}.png`));
  }
  return markExistsCache[name];
}

// คัด pool ให้เหลือเฉพาะที่มีไฟล์จริง — เติมไฟล์ทีหลังแล้ว restart ก็กลับมาสุ่มได้เอง
function existingMarks(names) {
  return names.filter(markExists);
}

async function loadMark(name) {
  if (!markExists(name)) throw new Error(`quoteStyles: ไม่พบไฟล์ mark "${name}.png" ใน assets/quote/`);
  if (!markCache[name]) markCache[name] = await loadImage(path.join(QUOTE_DIR, `${name}.png`));
  return markCache[name];
}

// เครื่องหมายคำพูดที่สุ่มหยิบมาวาง — ชื่อที่ไม่มีไฟล์จริงจะถูก existingMarks() คัดออกให้เอง
const OPEN_MARKS  = ['double_open', 'classic_open', 'block_open', 'outline_open', 'big_open'];
const CLOSE_MARKS = ['double_close', 'classic_close', 'block_close', 'outline_close'];

// ฟอนต์ของคำคม — คีย์ที่ผู้ใช้เลือกได้ ใช้ร่วมกันทั้งการ์ด "ไม่มีรูป" (renderPlain)
// และการ์ด "มีรูป" (ember/pillar/frame/panel/matte/side/center) ตั้งแต่ 2026-08-11
// แต่ละสไตล์ที่มีรูปยังมี**ฟอนต์เดิม**เป็นค่า default ของตัวเอง (ไม่ใช่ anakotmai ทุกตัว) —
// คีย์นี้จะเข้ามาแทนก็ต่อเมื่อผู้ใช้ส่ง `font` มาเท่านั้น ไม่งั้นการ์ดเก่าหน้าตาเปลี่ยนเงียบๆ
const PLAIN_FONTS = {
  anakotmai: { quote: 'Anakotmai', author: 'AnakotmaiLight' },  // ไม่มีหัว — ฟอนต์แบรนด์
  gsans:     { quote: 'GSans',     author: 'GSansLight' },      // มีหัว ทันสมัย
  sarabun:   { quote: 'Sarabun',   author: 'Sarabun' },         // มีหัว ทรงราชการ
};

// ตัวคูณขนาดฟอนต์ต่อ preset สำหรับการ์ด "มีรูป" — คูณเข้ากับ**จุดตั้งต้น**ของแต่ละสไตล์เอง
// (ไม่ใช่สัดส่วนตายตัวแบบ PLAIN_SIZES เพราะแต่ละสไตล์มี baseline ที่เคาะมาต่างกันอยู่แล้ว)
// m = 1.0 คือพฤติกรรมเดิมเป๊ะ — ไม่กระทบการ์ดที่ไม่ได้ส่ง textSize มา
// ⚠️ เดิม {0.82, 1.0, 1.22} = ห่างกันแค่ ~20% — user บอกว่า "กลาง กับ ใหญ่ ยังไม่ต่างกันมาก"
//    (2026-08-11 หลัง deploy รอบแรก) → ดันช่องห่างขึ้นเป็น ~38-40% ต่อขั้น
const QUOTE_SIZE_SCALE = { s: 0.68, m: 1.0, l: 1.40 };

const GREY_TINT = '#9aa0a6';   // เทากลาง — ลายน้ำบนพื้นสี CI ย้อมสีนี้ ไม่ใช่ดำ (ดำ = อ่านเป็นเงา)
const ORANGE = '#ff6a13';

// scrim (เงาก้นภาพ) ผสมสีแบรนด์เข้าหาดำเท่าไหร่ — 0 = ดำอมน้ำเงินแบบเดิม
// 0.78 เคาะจากการเรนเดอร์เทียบ 2026-08-06: เห็นว่าอมสีแบรนด์ชัด แต่ขาว/พื้นยัง 16.25:1
// (เกณฑ์ AA = 4.5) · ต่ำกว่านี้เงาจะเริ่มกลืนกับสีในรูปและคอนทราสต์ไหลลงเร็ว
const SCRIM_MIX = 0.78;

/** สีจริงของ scrim + luminance ที่ readableOnDark ต้องใช้ (บวกแสงรูปที่ลอดผ่าน ~5%) */
function scrimOf(accent, mix = SCRIM_MIX) {
  const hex = mix ? _mix(accent, BLACK, mix) : '#00050c';
  return { hex, rgb: _rgbTriplet(hex), lum: _lum(hex) + 0.006 };
}

/**
 * เตรียมรูปก่อนวาด — จุดเดียวที่ทุกสไตล์เรียก จะได้รองรับ duotone เหมือนกันหมด
 *
 * ⚠️ เคยใส่ duotone ไว้ใน renderVariant ตัวเดียว ผลคือดูโอโทนเลือกได้แค่ 4 มุม
 *    ส่วน pillar/frame/center เลือกไม่ได้ทั้งที่ไม่มีเหตุผลทางดีไซน์ (แก้ 2026-08-07)
 *    → renderer ใหม่ทุกตัวต้องเรียกตัวนี้ ห้ามเรียก sharp().modulate() ตรงๆ อีก
 *
 * duotone: ขาวดำ → screen ด้วยสีเข้ม (ยกเงามาติดสี) → multiply ด้วยสีอ่อน (ดึงไฮไลต์มาติดสี)
 * ปลายเข้มใช้ scrimOf() ตัวเดียวกับเงา รูปกับเงาจึงเป็นสีเดียวกัน มองไม่เห็นรอยต่อ
 */
async function prepImage(buf, { saturation = 1.0, duotone = false, accent = ORANGE } = {}) {
  if (!duotone) return await sharp(buf).modulate({ saturation }).toBuffer();

  const img = await loadImage(await sharp(buf).greyscale().toBuffer());
  const cv  = createCanvas(img.width, img.height);
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = scrimOf(accent).hex;       ctx.fillRect(0, 0, img.width, img.height);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = _mix(accent, WHITE, 0.62); ctx.fillRect(0, 0, img.width, img.height);
  return cv.toBuffer('image/png');
}
const WHITE  = '#ffffff';
const BLACK  = '#000000';

// คืน '#ffffff' หรือ '#000000' ตาม WCAG relative luminance (with sRGB linearization)
function contrastText(hex) {
  const lin = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const r = lin(parseInt(hex.slice(1, 3), 16) / 255);
  const g = lin(parseInt(hex.slice(3, 5), 16) / 255);
  const b = lin(parseInt(hex.slice(5, 7), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.179 ? BLACK : WHITE;
}

function _lum(hex) {
  const lin = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const r = lin(parseInt(hex.slice(1, 3), 16) / 255);
  const g = lin(parseInt(hex.slice(3, 5), 16) / 255);
  const b = lin(parseInt(hex.slice(5, 7), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * สีที่อ่านออกบนพื้นเข้ม — ผสมขาวทีละ 10% จนคอนทราสต์ถึงเกณฑ์
 *
 * ที่มา: ชื่อผู้พูดวาดด้วยสี accent ทับ gradient ดำเข้ม 0.95 ที่ก้นภาพ · ส้ม CI (#ff6a13)
 * สว่างพอเลยอ่านออกมาตลอด แต่พอผู้ใช้ตั้งสี CI เข้ม (เช่นน้ำเงิน #5865f3) ตัวอักษร
 * **จมหายไปกับพื้น** (เจอ 2026-08-06) — กรอบเส้นหนายังใช้สีจริงได้ ไม่ต้องแก้
 */
// เกณฑ์ 6.2 = คอนทราสต์ของ**ส้ม CI เดิม (#ff6a13) = 6.31** บนพื้นเดียวกัน (เผื่อขอบนิดหน่อย
// ให้ส้มไม่โดนแตะ) — ไม่ได้ตั้งลอยๆ แต่ยึดความอ่านง่ายที่คนคุ้นอยู่แล้วเป็นฐาน
// เอาความอ่านง่ายที่คนคุ้นอยู่แล้วเป็นฐาน (น้ำเงิน #5865f3 ได้แค่ 3.94 → ผสมขาว 30%)
//
// bgLum = luminance ของ scrim จริง — ต้องส่งมาเมื่อ scrim ถูกย้อมสีแบรนด์ (scrimLum())
// เลข 0.008 เดิมคือค่าของดำ #00050c บวกแสงรูปที่ลอดผ่าน 5% — ตอนนี้คิดจากสีจริงแทน
function readableOnDark(hex, min = 6.2, bgLum = 0.008) {
  const bg = bgLum;
  const ratio = l => (l + 0.05) / (bg + 0.05);
  if (!/^#[0-9a-fA-F]{6}$/.test(hex) || ratio(_lum(hex)) >= min) return hex;

  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  for (let t = 0.1; t <= 0.9; t += 0.1) {
    const mix = [r, g, b].map(c => Math.round(c + (255 - c) * t));
    const out = '#' + mix.map(c => c.toString(16).padStart(2, '0')).join('');
    if (ratio(_lum(out)) >= min) return out;
  }
  return WHITE;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const _segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });
function graphemes(text) { return [..._segmenter.segment(text)].map(s => s.segment); }

const _thaiSeg = (() => {
  try { return new Intl.Segmenter('th', { granularity: 'word' }); } catch { return null; }
})();

// แตก text เป็น units สำหรับ line-wrap
// — space-separated segments คง space ไว้ (prefixSpace=true)
// — ภายใน segment ใช้ Intl.Segmenter ตัดคำไทยอีกชั้น (prefixSpace=false)
function _breakUnits(text) {
  const result = [];
  const spaceParts = text.split(' ');
  for (let i = 0; i < spaceParts.length; i++) {
    const part = spaceParts[i];
    if (!part) continue;
    const segs = _thaiSeg
      ? [..._thaiSeg.segment(part)].map(s => s.segment).filter(Boolean)
      : [part];
    segs.forEach((seg, j) => result.push({ text: seg, prefixSpace: j === 0 && i > 0 }));
  }
  return result;
}

function _wrapGreedy(ctx, text, maxWidth) {
  const lines = [];
  for (const para of text.split('\n')) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const units = _breakUnits(trimmed);
    if (!units.length) continue;
    let cur = '';
    for (const { text: u, prefixSpace } of units) {
      const test = cur + (prefixSpace ? ' ' : '') + u;
      if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = u; }
      else cur = test;
    }
    if (cur) lines.push(cur);
  }
  return lines.length ? lines : [''];
}

function wrapText(ctx, text, maxWidth) {
  const greedy = _wrapGreedy(ctx, text, maxWidth);
  if (greedy.length <= 1) return greedy;
  // binary search: tightest width giving same line count → balanced lines
  const n = greedy.length;
  let lo = 1, hi = maxWidth;
  while (hi - lo > 2) {
    const mid = Math.floor((lo + hi) / 2);
    if (_wrapGreedy(ctx, text, mid).length <= n) hi = mid;
    else lo = mid;
  }
  return _wrapGreedy(ctx, text, hi);
}

/**
 * ตัดบรรทัดที่ยาวเกินขอบทิ้งลงบรรทัดใหม่ **กลางคำ** — วาล์วนิรภัยของการจัดข้อความแบบเต็มขอบ
 *
 * ที่มา (2026-08-07): _wrapGreedy ตัดตามหน่วยคำ ถ้าหน่วยเดียวยาวกว่าทั้งบรรทัด (URL ยาวๆ
 * หรือคำที่ Intl.Segmenter ตัดไม่ได้) มันจะล้นขอบ · ลูปหาไซซ์ในสไตล์แถบสีเห็นว่าไม่ fit
 * แล้วย่อฟอนต์ลงเรื่อยๆ ผลคือคำคมทั้งใบตัวจิ๋วเพราะคำเดียว → ตัดกลางคำแทน
 *
 * ตัดด้วย graphemes() ไม่ใช่ตัวอักษรดิบ สระ/วรรณยุกต์ไทยจึงไม่หลุดจากพยัญชนะ
 */
function _breakLongLine(ctx, line, maxWidth, sp) {
  if (lsWidth(ctx, line, sp) <= maxWidth) return [line];
  const out = [];
  let cur = '';
  for (const g of graphemes(line)) {
    const test = cur + g;
    if (lsWidth(ctx, test, sp) > maxWidth && cur) { out.push(cur); cur = g; }
    else cur = test;
  }
  if (cur) out.push(cur);
  return out;
}

/** จัดข้อความให้เต็มขอบ: greedy อัดเต็มทุกบรรทัด แล้วตัดกลางคำเฉพาะบรรทัดที่ยังล้น */
function _wrapFill(ctx, text, maxWidth, sp = 1.0) {
  return _wrapGreedy(ctx, text, maxWidth).flatMap(l => _breakLongLine(ctx, l, maxWidth, sp));
}

function lsDraw(ctx, text, x, y, sp = 1.5) {
  let cx = x;
  for (const g of graphemes(text)) { ctx.fillText(g, cx, y); cx += ctx.measureText(g).width + sp; }
  return cx - x;
}

function lsWidth(ctx, text, sp = 1.5) {
  let w = 0;
  for (const g of graphemes(text)) w += ctx.measureText(g).width + sp;
  return w;
}

function fitFont(ctx, text, maxWidth, startSz, maxLines = 4, fontFamily = 'Anakotmai') {
  // ถ้า user ใส่ \n เอง — respect ทุกบรรทัด ไม่ wrap เพิ่ม แค่ shrink font ให้ fit
  if (text.includes('\n')) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const minSz = Math.round(startSz * 0.30);
    let sz = startSz;
    while (sz > minSz) {
      ctx.font = `bold ${sz}px ${fontFamily}`;
      if (lines.every(l => lsWidth(ctx, l) <= maxWidth)) return { fontSize: sz, lines };
      sz = Math.max(minSz, Math.round(sz * 0.9));
    }
    ctx.font = `bold ${minSz}px ${fontFamily}`;
    return { fontSize: minSz, lines };
  }

  const minSz = Math.round(startSz * 0.65);
  let sz = startSz;
  while (sz > minSz) {
    ctx.font = `bold ${sz}px ${fontFamily}`;
    const lines = wrapText(ctx, text, maxWidth);
    const allFit = lines.every(l => lsWidth(ctx, l) <= maxWidth);
    if (lines.length <= maxLines && allFit) return { fontSize: sz, lines };
    sz = Math.max(minSz, Math.round(sz * 0.9));
  }
  ctx.font = `bold ${minSz}px ${fontFamily}`;
  return { fontSize: minSz, lines: wrapText(ctx, text, maxWidth) };
}


function drawMark(ctx, img, x, y, h) {
  const w = (img.width / img.height) * h;
  ctx.drawImage(img, x, y, w, h);
  return w;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

function drawTinted(ctx, img, x, y, w, h, color) {
  const tmp = createCanvas(w, h);
  const tc  = tmp.getContext('2d');
  tc.drawImage(img, 0, 0, w, h);
  tc.globalCompositeOperation = 'source-in';
  tc.fillStyle = color;
  tc.fillRect(0, 0, w, h);
  ctx.drawImage(tmp, x, y, w, h);
}

async function toPng(canvas) {
  return canvas.toBuffer('image/png');
}

// ── Core render ───────────────────────────────────────────────────────────────
// markScale: relative size of mark (1.0 = default)
// gradDark:  0.0–1.0 how dark the bottom gradient is
async function renderVariant(buf, { quoteText, authorName, side = 'left', vertical = 'bottom', markScale = 1.0, gradDark = 0.95, saturation = 0.15, fontBold = 'GSans', fontLight = 'AnakotmaiLight', font = null, textSize = 'm', accentColor, markExtraGap = 0, markAfterText = false, noMark = false, scrimMix = SCRIM_MIX, duotone = false }) {
  const accent = accentColor || ORANGE;
  const isRight = side === 'right';
  const isTop   = vertical === 'top';
  // font (preset key) ทับ fontBold/fontLight เฉพาะตอนผู้ใช้เลือกมาจริง — ไม่งั้นคงฟอนต์เดิมของสไตล์
  if (font && PLAIN_FONTS[font]) { fontBold = PLAIN_FONTS[font].quote; fontLight = PLAIN_FONTS[font].author; }
  const sizeScale = QUOTE_SIZE_SCALE[textSize] ?? 1;

  // ⚠️ saturation ไม่มีผลตอน duotone (รูปถูกทำขาวดำก่อนย้อมอยู่แล้ว) → UI ต้องซ่อนปุ่มสีภาพ
  const work = await prepImage(buf, { saturation, duotone, accent });
  const img  = await loadImage(work);
  const W = img.width, H = img.height;
  const cv  = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);


  const pad    = Math.round(Math.min(W, H) * 0.055);
  const barW   = Math.max(2, Math.round(W * 0.0024));
  const barGap = Math.round(pad * 0.5);
  const qsz    = Math.max(36, Math.round(W * 0.065 * sizeScale));
  const nsz    = Math.max(16, Math.round(W * 0.030));
  const markH  = Math.max(54, Math.round(W * 0.090 * markScale));
  const markGap = Math.round(pad * 0.25);

  const maxW  = W * 0.80;
  const { fontSize: qszFit, lines } = fitFont(ctx, quoteText, maxW - barW - barGap - 4, qsz, 4, fontBold);
  const lh    = qszFit * 1.2;
  const textH = lines.length * lh + nsz * 1.8;

  const textX        = isRight ? W - maxW - pad - barW - barGap - 4 : pad + barW + barGap + 4;
  const barX         = isRight ? W - pad - barW : pad;
  const extraGap     = Math.round(pad * markExtraGap);
  // pool คัดเฉพาะชื่อที่มีไฟล์จริง (bug-079) — ต้องรู้ก่อนคำนวณ layout ไม่งั้นเว้นที่ให้ mark ที่ไม่ได้วาด
  const pool         = noMark ? [] : existingMarks(isRight ? CLOSE_MARKS : OPEN_MARKS);
  const hasMark      = pool.length > 0;
  const effectMarkH  = hasMark ? markH : 0;
  const effectGap    = hasMark ? markGap + extraGap : 0;
  const markY        = isTop
    ? (markAfterText ? pad + textH + effectGap : pad)
    : H - pad - textH - effectGap - effectMarkH;
  const textBlockTop = isTop
    ? (markAfterText ? pad : pad + effectMarkH + effectGap)
    : H - pad - textH;

  // gradient — scrimMix = ผสม accent เข้าหาดำเท่าไหร่ (null/0 = ดำอมน้ำเงินเดิม 0,5,12)
  //
  // ⚠️ ที่ย้อมได้เพราะ**ผสมดำก่อนเสมอ** ไม่ใช่เอา accent ดิบมาใช้ · ยิ่ง scrimMix เข้าใกล้ 1
  //    ยิ่งเข้ม = ปลอดภัยขึ้น · ต่ำกว่า ~0.7 เมื่อไหร่ luminance จะเริ่มไต่ขึ้นจน readableOnDark()
  //    ที่ยึด bg = 0.008 เริ่มโกหก (ชื่อผู้พูดบางสียังอ่านออกแต่คอนทราสต์ต่ำกว่าเกณฑ์ที่ตั้งไว้)
  const scrimRGB = scrimOf(accent, scrimMix).rgb;
  const gV = isTop
    ? ctx.createLinearGradient(0, 0, 0, (textBlockTop + textH) + H * 0.2)
    : ctx.createLinearGradient(0, H, 0, markY - H * 0.2);
  gV.addColorStop(0,   `rgba(${scrimRGB},${gradDark})`);
  gV.addColorStop(0.4, `rgba(${scrimRGB},${Math.round(gradDark * 0.84 * 100) / 100})`);
  gV.addColorStop(1,   `rgba(${scrimRGB},0)`);
  ctx.fillStyle = gV;
  ctx.fillRect(0, 0, W, H);

  // pool ว่าง = ยังวาดข้อความต่อได้ตามปกติ แค่ไม่มีเครื่องหมายคำพูด (ดีกว่าโยน error ทั้งใบ)
  if (hasMark) {
    const markImg = await loadMark(pool[Math.floor(Math.random() * pool.length)]);
    const markW   = (markImg.width / markImg.height) * markH;
    const markX   = isRight ? textX + maxW - markW : pad;
    drawTinted(ctx, markImg, markX, markY, markW, markH, accent);
  }

  ctx.fillStyle = accent;
  ctx.fillRect(barX, textBlockTop, barW, textH);

  ctx.textBaseline = 'top';
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.font = `bold ${qszFit}px ${fontBold}`;
  let ty = textBlockTop;
  for (const l of lines) {
    const drawX = isRight ? textX + (maxW - lsWidth(ctx, l, 1.0)) : textX;
    ctx.fillStyle = WHITE; lsDraw(ctx, l, drawX, ty, 1.0);
    ty += lh;
  }

  ty += nsz * 0.5;
  ctx.font = `${nsz}px ${fontLight}`;
  const authorStr = `— ${authorName}`;
  const aw = lsWidth(ctx, authorStr, 0.8);
  const ax = isRight ? textX + (maxW - aw) : textX;

  // top mode: author หลุดโซน gradient เข้ม → fill bg CI accent หลังตัวอักษร
  if (isTop) {
    const padX = Math.round(nsz * 0.5), padY = Math.round(nsz * 0.35);
    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = accent;
    ctx.fillRect(ax - padX, ty - padY, aw + padX * 2, nsz + padY * 2);
  }

  ctx.fillStyle = isTop ? contrastText(accent) : WHITE;
  if (!isTop) { ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }
  lsDraw(ctx, authorStr, ax, ty, 0.8);

  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  return { buffer: await toPng(cv), ext: 'png', vertical, side };
}

// ── Style 7: quote_border (mark + H-bar + V-bar เป็นชิ้นเดียว) ───────────────
// PNG 822x714 — V-bar spans y 32%–95%, text area starts at x 24%, y 32%
async function renderBorder(buf, { quoteText, authorName, saturation = 0.15, accentColor, duotone = false, font = null, textSize = 'm' }) {
  const accent = accentColor || ORANGE;
  const fontBold  = font && PLAIN_FONTS[font] ? PLAIN_FONTS[font].quote  : 'GSans';
  const fontLight = font && PLAIN_FONTS[font] ? PLAIN_FONTS[font].author : 'AnakotmaiLight';
  const sizeScale = QUOTE_SIZE_SCALE[textSize] ?? 1;
  const work = await prepImage(buf, { saturation, duotone, accent: accentColor || ORANGE });
  const img  = await loadImage(work);
  const W = img.width, H = img.height;
  const cv  = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);

  const pad  = Math.round(Math.min(W, H) * 0.055);
  const qsz  = Math.max(36, Math.round(W * 0.065 * sizeScale));
  const nsz  = Math.max(16, Math.round(W * 0.030));

  // quote_border.png 698x591 — V-bar spans y 25%–100%, text area x ≈ 24%
  const borderImg = await loadMark('frame_left');

  const maxW7   = W * 0.80;
  const { fontSize: qszFit, lines } = fitFont(ctx, quoteText, maxW7, qsz, 4, fontBold);
  const lh      = qszFit * 1.2;
  const textH   = lines.length * lh + nsz * 1.8;
  const maxTextW = maxW7;

  // scale PNG 50% — V-bar = 75% of height
  const pngH    = (textH / 0.75) * 0.5;
  const pngW    = pngH * (698 / 591);
  const borderX = Math.round(pad * 0.6);
  const textBlockTop0 = H - pad - textH;
  const borderY       = textBlockTop0 - pngH * 0.25;
  const textBlockTop  = textBlockTop0 + Math.round(pad * 0.4);

  // text starts right of V-bar (24%) + double gap
  const vBarRight = borderX + pngW * 0.24;
  const textGap   = pngW * 0.08;   // double the original 0.04
  const textX     = vBarRight + textGap;

  const scrim = scrimOf(accent);
  const gV = ctx.createLinearGradient(0, H, 0, borderY - H * 0.2);
  gV.addColorStop(0,   `rgba(${scrim.rgb},0.95)`);
  gV.addColorStop(0.4, `rgba(${scrim.rgb},0.80)`);
  gV.addColorStop(1,   `rgba(${scrim.rgb},0)`);
  ctx.fillStyle = gV; ctx.fillRect(0, 0, W, H);

  // draw border PNG
  // ⚠️ กรอบเป็น PNG สีส้ม CI ที่ baked มาแล้ว — ต้องย้อมตาม accent เหมือน mark ของสไตล์ ember
  //    ไม่ย้อม = ตั้งสี CI เองแล้วมีผลแค่ตัวหนังสือ กรอบยังส้มอยู่ (เจอ 2026-08-06)
  drawTinted(ctx, borderImg, borderX, borderY, pngW, pngH, accent);

  // quote text
  ctx.textBaseline = 'top';
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.font = `bold ${qszFit}px ${fontBold}`;
  let ty = textBlockTop;
  for (const l of lines) {
    ctx.fillStyle = WHITE; lsDraw(ctx, l, textX, ty, 1.0);
    ty += lh;
  }

  ty += nsz * 0.5;
  ctx.font = `${nsz}px ${fontLight}`; ctx.fillStyle = readableOnDark(accent, 6.2, scrim.lum);
  ctx.shadowBlur = 4; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  lsDraw(ctx, `— ${authorName}`, textX, ty, 0.8);

  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  return { buffer: await toPng(cv), ext: 'png', vertical: 'bottom', side: 'left' };
}

// ค่าปรับระยะของ frame-right — ทุกค่าเป็น "เท่าของขนาดฟอนต์" ยกเว้น stroke ที่เทียบความกว้างภาพ
// แยกออกมาเพื่อให้ scripts/media/quoteFramePreview.js เรนเดอร์เทียบหลายค่าได้โดยไม่ต้องแก้โค้ด
// (user เคาะชุดนี้จากพรีวิวจริง 2026-08-06 — อย่าเดาค่าเอง ให้เรนเดอร์เทียบแล้วให้คนเลือก)
const FRAME_RIGHT = {
  stroke:    0.013,   // ความหนาเส้น เทียบความกว้างภาพ
  padTop:    0.80,    // ช่องเหนือบรรทัดคำคมแรก
  padX:      0.55,    // ระยะจากเส้นตั้งขวาถึงตัวอักษร
  gapAuth:   0.60,    // ช่องระหว่างบล็อกคำคมกับบรรทัดชื่อ (เท่าของ nsz)
  authorTop: 2.6,     // ชื่อห่างจากขอบล่างภาพ (เท่าของ nsz)
  line:      0.72,    // เส้นล่างอยู่ต่ำจากหัวตัวอักษรของชื่อเท่าไหร่ (เท่าของ nsz)
  barLen:    0.15,    // ความยาวแถบล่างเทียบความกว้างกรอบ
};

// ── Style 8: quote_border_2 — กรอบตัว C ชิดขวา (แถบบน + เส้นตั้งขวา + แถบล่างสั้น)
async function renderBorder2(buf, { quoteText, authorName, saturation = 0.15, accentColor, duotone = false, font = null, textSize = 'm' }) {
  const accent = accentColor || ORANGE;
  const fontBold  = font && PLAIN_FONTS[font] ? PLAIN_FONTS[font].quote  : 'GSans';
  const fontLight = font && PLAIN_FONTS[font] ? PLAIN_FONTS[font].author : 'AnakotmaiLight';
  const sizeScale = QUOTE_SIZE_SCALE[textSize] ?? 1;
  const work = await prepImage(buf, { saturation, duotone, accent: accentColor || ORANGE });
  const img  = await loadImage(work);
  const W = img.width, H = img.height;
  const cv  = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);

  const pad  = Math.round(Math.min(W, H) * 0.055);
  const qsz  = Math.max(36, Math.round(W * 0.065 * sizeScale));
  const nsz  = Math.max(16, Math.round(W * 0.030));

  const maxW8   = W * 0.80;
  const { fontSize: qszFit, lines } = fitFont(ctx, quoteText, maxW8, qsz, 4, fontBold);
  const lh      = qszFit * 1.2;

  // ── กรอบวาดเอง ไม่ใช้ assets/quote/frame_right.png (เคาะ 2026-08-06) ──────────
  // เหตุผล: ย่อ/ขยาย PNG ให้พอดีเนื้อหาคุมตำแหน่งไม่ได้จริง — อัตราส่วนไฟล์บังคับความสูง
  // พอความกว้างชนขอบภาพก็ต้องบีบ เส้นเลยหนาบางไม่คงที่ · ไฟล์ก็ถูกแก้ระหว่างทางบ่อย
  //
  // ⚠️ **เส้นล่างของกรอบ = บรรทัดชื่อผู้พูด** (user เคาะ 2026-08-06 พร้อมภาพตัวอย่าง)
  //    ชื่อไม่ได้ "อยู่เหนือเส้น" แต่นั่งอยู่ **บนเส้นเดียวกัน** โดยเส้นล่างวิ่งต่อจากท้ายชื่อ
  //    ไปจบที่มุมขวาล่าง → ต้องคิดตำแหน่งจากกึ่งกลางบรรทัดชื่อ ไม่ใช่จากขอบล่างกรอบ
  const stroke  = Math.max(3, Math.round(W * FRAME_RIGHT.stroke));
  const padTop  = Math.round(qszFit * FRAME_RIGHT.padTop);       // ช่องเหนือบรรทัดแรก (สระบนไทยยื่นสูง)
  const padX    = Math.round(qszFit * FRAME_RIGHT.padX);       // ระยะจากเส้นตั้งถึงตัวอักษร
  const gapAuth = Math.round(nsz * FRAME_RIGHT.gapAuth);          // ช่องระหว่างบล็อกคำคมกับบรรทัดชื่อ

  ctx.font = `bold ${qszFit}px ${fontBold}`;
  const widest = Math.max(...lines.map(l => lsWidth(ctx, l, 1.0)));

  ctx.font = `${nsz}px ${fontLight}`;
  const authorStr = `>_ ${authorName}`;            // `>_` แทนขีดยาว (user เคาะ)
  const aw = lsWidth(ctx, authorStr, 0.8);

  const fRight   = W - pad - stroke / 2;           // stroke วาดคร่อมเส้นทาง → เผื่อครึ่งเส้น
  const authorTop = H - pad - Math.round(nsz * FRAME_RIGHT.authorTop);    // ยกขึ้นจาก pad ล่าง
  const fBottom   = Math.round(authorTop + nsz * FRAME_RIGHT.line);   // เส้นล่าง = กึ่งกลางบรรทัดชื่อ (user เคาะจากพรีวิว)

  const quoteTop = authorTop - gapAuth - lines.length * lh;
  const fTop     = quoteTop - padTop;

  const textRight = fRight - stroke - padX;        // คำคมชิดขวา เว้นจากเส้นตั้ง
  // แถบล่างสั้นๆ ต่อจากท้ายชื่อไปมุมขวา — ชื่อจึงต้องจบก่อนแถบ
  const fW0      = fRight - Math.max(pad, fRight - stroke - padX * 2 - widest);
  const barLen   = Math.max(Math.round(fW0 * FRAME_RIGHT.barLen), stroke * 4);
  const authorRight = fRight - barLen - Math.round(nsz * 0.7);
  const fLeft    = Math.max(pad + stroke / 2,
                            Math.min(textRight - widest - padX, authorRight - aw - padX));

  const scrim = scrimOf(accent);
  const gV = ctx.createLinearGradient(0, H, 0, fTop - H * 0.2);
  gV.addColorStop(0,   `rgba(${scrim.rgb},0.95)`);
  gV.addColorStop(0.4, `rgba(${scrim.rgb},0.80)`);
  gV.addColorStop(1,   `rgba(${scrim.rgb},0)`);
  ctx.fillStyle = gV; ctx.fillRect(0, 0, W, H);

  // ตัว C: แถบบน → มุมขวาบน → เส้นตั้งขวา → มุมขวาล่าง → แถบล่างที่จบตรงท้ายชื่อ
  const rad = Math.min(Math.round((fRight - fLeft) * 0.03), Math.round((fBottom - fTop) * 0.22));
  ctx.beginPath();
  ctx.moveTo(fLeft, fTop);
  ctx.lineTo(fRight - rad, fTop);
  ctx.arcTo(fRight, fTop, fRight, fTop + rad, rad);
  ctx.lineTo(fRight, fBottom - rad);
  ctx.arcTo(fRight, fBottom, fRight - rad, fBottom, rad);
  ctx.lineTo(fRight - barLen, fBottom);
  ctx.strokeStyle = accent;
  ctx.lineWidth = stroke;
  ctx.lineJoin = 'round';
  ctx.lineCap  = 'butt';
  ctx.stroke();

  ctx.textBaseline = 'top';
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.font = `bold ${qszFit}px ${fontBold}`;
  let ty = quoteTop;
  for (const l of lines) {
    ctx.fillStyle = WHITE; lsDraw(ctx, l, textRight - lsWidth(ctx, l, 1.0), ty, 1.0);
    ty += lh;
  }

  ctx.font = `${nsz}px ${fontLight}`;
  // สี accent เข้มๆ จมหายไปกับ gradient ดำก้นภาพ → ใช้เวอร์ชันที่อ่านออก (กรอบยังสีจริง)
  ctx.fillStyle = readableOnDark(accent, 6.2, scrim.lum);
  // ⚠️ shadowBlur อย่างเดียวไม่มีผล — canvas default shadowColor เป็นดำโปร่งใส 100%
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 6; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 1;
  lsDraw(ctx, authorStr, authorRight - aw, authorTop, 0.8);

  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  return { buffer: await toPng(cv), ext: 'png', vertical: 'bottom', side: 'right' };
}

// ── quote-3-panel: รูปครึ่งหนึ่ง + แถบทึบสี CI อีกครึ่ง ──────────────────────
//
// ที่มา (2026-08-06): สไตล์ที่มีอยู่ 6 ใน 8 เป็นเลย์เอาต์เดียวกันหมด (ขาวบน scrim ดำก้นภาพ)
// ต่างกันแค่ซ้าย/ขวา/มีกรอบไม่มีกรอบ → การ์ดทุกใบหน้าตาเหมือนกัน
//
// ⛔ ห้ามแก้ให้ scrim ดำของสไตล์อื่นย้อมตามสี CI เพื่อแก้ปัญหานี้ — ระบบคอนทราสต์ทั้งชุด
//    ยึด `bg = 0.008` ใน readableOnDark() และตัวคำคมวาดด้วย WHITE ตายตัว · พื้นสว่างขึ้น
//    เมื่อไหร่ = อ่านไม่ออกทั้งใบ · สไตล์นี้จึง **ไม่มี gradient เลย** ความอ่านออกมาจากพื้นทึบ
//    ที่คำนวณตรงๆ ได้ด้วย contrastText()
//
// รับสี base สีเดียว แล้วแตกเป็นชุดสีทั้งใบ — ห้ามเพิ่ม config สีแยกทีหลัง
function panelPalette(base) {
  const ink = contrastText(base);                       // ดำ/ขาว แล้วแต่ luminance ของ base (WCAG)
  const rgb = ink === WHITE ? '255,255,255' : '0,0,0';
  return { panel: base, ink, sub: `rgba(${rgb},0.72)` };
}

/** '#rrggbb' → 'r,g,b' สำหรับประกอบ rgba() */
function _rgbTriplet(hex) {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',');
}

// ⛔ เคยมีโหมด fade (รูปไล่จางเข้าหาแถบสี) — **ตัดออกแล้ว 2026-08-07** user ตัดสินว่าไม่สวย
//    อย่าใส่กลับโดยไม่ถามก่อน
async function renderPanel(buf, { quoteText, authorName, saturation = 1.0, accentColor, imgRatio = 0.65, panelAt = 'bottom', align = 'left', panelAlpha = 0.90, inkOverride = null, font = null, textSize = 'm' }) {
  const accent = accentColor || ORANGE;
  const fontBold  = font && PLAIN_FONTS[font] ? PLAIN_FONTS[font].quote  : 'Anakotmai';
  const fontLight = font && PLAIN_FONTS[font] ? PLAIN_FONTS[font].author : 'AnakotmaiLight';
  const sizeScale = QUOTE_SIZE_SCALE[textSize] ?? 1;
  const pal = panelPalette(accent);
  // inkOverride = บังคับสีตัวอักษรแทนที่จะให้ contrastText() ตัดสิน — ไว้เทียบให้คนดูเท่านั้น
  const panel = pal.panel;
  const ink   = inkOverride || pal.ink;
  const sub   = inkOverride
    ? `rgba(${inkOverride === WHITE ? '255,255,255' : '0,0,0'},0.72)` : pal.sub;

  const meta = await sharp(buf).metadata();
  const W = meta.width, H = meta.height;

  const cv  = createCanvas(W, H);
  const ctx = cv.getContext('2d');

  const padX = Math.round(W * 0.055);
  const padY = Math.round(W * 0.050);
  const maxW = W - padX * 2;

  // ความสูงแถบ **ยืดตามข้อความ** ไม่ได้ตรึงที่ imgRatio แล้ว (เคาะ 2026-08-07)
  //
  // เหตุ: ตรึงความสูงไว้ = ตัวหนังสือโตได้แค่จนสูงเต็มแถบแล้วหยุด · พอหยุดเพราะความสูง
  // ความกว้างก็เหลือ คำคมสั้นเลยดูแหว่งไปฝั่งตรงข้าม · ให้แถบยืดแทน ตัวหนังสือจะเต็มความกว้างเสมอ
  // เพดาน 28-45% กันไม่ให้แต่ละใบสูงต่างกันจนดูคนละชุด
  const MIN_PANEL = Math.round(H * 0.28);
  const MAX_PANEL = Math.round(H * 0.45);

  const pool    = existingMarks(OPEN_MARKS);
  const hasMark = pool.length > 0;

  // ⚠️ ใช้ _wrapGreedy ไม่ใช่ wrapText — wrapText บีบความกว้างลงจนได้บรรทัด "สมดุล" ซึ่งแปลว่า
  //    สั้นกว่าที่ควร · แถบสีต้องการให้ข้อความเต็มขอบ จึงใช้ greedy ที่อัดเต็ม maxW ทุกบรรทัด
  // ⚠️ ชื่อผู้พูดผูกกับ **ความกว้างการ์ด** ไม่ใช่ขนาดคำคม — เคยผูกกับขนาดคำคมแล้วคำคมยาว
  //    (ฟอนต์เล็กลง) ทำให้ชื่อผู้พูดหดตามจนเล็กกว่าใบอื่นชัดเจน มันเป็นข้อมูลกำกับ ไม่ใช่พระเอก
  //    ต้องเท่ากันทุกใบ (เจอ 2026-08-07)
  const nsz     = Math.max(14, Math.round(W * 0.028));
  const authGap = Math.round(nsz * 0.9);

  let fit, lh, markH, markGap, blockH;
  const startSz = Math.round(W * 0.150 * sizeScale);
  // floor ผูกกับ startSz ของ preset เอง (ไม่ใช่ค่าคงที่) — กัน s/m/l บรรจบกันตอนคำคมยาว
  // เหมือน bug ที่เจอใน renderPlain (2026-08-11)
  const MIN = Math.round(startSz * 0.6);
  for (let sz = startSz; ; sz = Math.round(sz * 0.95)) {
    ctx.font = `bold ${sz}px ${fontBold}`;
    const lines = _wrapFill(ctx, quoteText, maxW, 1.0);
    lh      = sz * 1.18;
    markH   = hasMark ? Math.round(sz * 0.80) : 0;
    markGap = hasMark ? Math.round(sz * 0.30) : 0;
    blockH  = markH + markGap + lines.length * lh + authGap + nsz;
    const fitsW = lines.every(l => lsWidth(ctx, l, 1.0) <= maxW);
    if ((fitsW && blockH + padY * 2 <= MAX_PANEL) || sz <= MIN) { fit = { fontSize: sz, lines }; break; }
  }

  const panelH = Math.min(MAX_PANEL, Math.max(MIN_PANEL, blockH + padY * 2));
  const panelY = panelAt === 'bottom' ? H - panelH : 0;

  // รูปกินเต็มใบเสมอ แล้วค่อยเอาสีทับแถบ — เพราะแถบโปร่งแสง ต้องมีรูปอยู่ข้างหลังให้เห็น
  const work = await sharp(buf).modulate({ saturation })
    .resize(W, H, { fit: 'cover', position: 'attention' }).toBuffer();
  ctx.drawImage(await loadImage(work), 0, 0, W, H);

  // ⚠️ panelAlpha ต่ำกว่า 0.85 ไม่ได้ — รูปที่ลอดขึ้นมามีสีอะไรก็ได้ ยิ่งโปร่งยิ่งดึง luminance
  //    ของพื้นออกจากค่าที่ contrastText() คำนวณไว้ · เคสแย่สุดคือพื้นสีเข้ม (ตัวหนังสือขาว)
  //    เจอรูปสว่างจ้า · 0.90 คือค่าที่ใช้จริง (ลอง 0.85 แล้วถอยกลับ 2026-08-07 รูปลอดขึ้นมากวน)
  //    ที่ 0.80 คอนทราสต์ตกต่ำกว่า AA 4.5 ห้ามลงต่อ
  ctx.fillStyle = `rgba(${_rgbTriplet(panel)},${panelAlpha})`;
  ctx.fillRect(0, panelY, W, panelH);

  const isRight = align === 'right';
  const right   = W - padX;
  ctx.textBaseline = 'top';
  let ty = panelY + Math.round((panelH - blockH) / 2);

  if (hasMark) {
    const markImg = await loadMark(pool[Math.floor(Math.random() * pool.length)]);
    const markW   = (markImg.width / markImg.height) * markH;
    drawTinted(ctx, markImg, isRight ? right - markW : padX, ty, markW, markH, ink);
    ty += markH + markGap;
  }

  ctx.font = `bold ${fit.fontSize}px ${fontBold}`;
  ctx.fillStyle = ink;
  for (const l of fit.lines) {
    lsDraw(ctx, l, isRight ? right - lsWidth(ctx, l, 1.0) : padX, ty, 1.0);
    ty += lh;
  }

  ty += authGap;
  ctx.font = `${nsz}px ${fontLight}`;
  ctx.fillStyle = sub;
  lsDraw(ctx, authorName, isRight ? right - lsWidth(ctx, authorName, 0.8) : padX, ty, 0.8);

  return { buffer: await toPng(cv), ext: 'png', vertical: panelAt, side: align };
}

// ── ตระกูล panel: สไตล์อื่นที่ใช้ base สีเดียวกัน ─────────────────────────────
//
// กติกาของทั้งตระกูล — พื้นที่ที่ตัวหนังสือทับต้องเป็น**สีที่รู้ค่าแน่นอน**เสมอ (สีทึบ หรือ
// ปลายเข้มของ gradient ที่ clamp ไว้แล้ว) ห้ามให้ตัวหนังสือทับรูปดิบ ๆ เพราะ contrastText()
// คำนวณจากสีเดียว ไม่ได้ดูรูป

/** ผสม hex เข้าหาสีเป้าหมาย t = 0..1 (ใช้บังคับให้ปลาย gradient เข้ม/อ่อนพอเสมอ) */
function _mix(hex, toward, t) {
  const a = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const b = [1, 3, 5].map(i => parseInt(toward.slice(i, i + 2), 16));
  return '#' + a.map((c, i) => Math.round(c + (b[i] - c) * t).toString(16).padStart(2, '0')).join('');
}

/**
 * วางบล็อกคำคม (เครื่องหมาย + ข้อความ + ชื่อ) กึ่งกลางแนวตั้งในกล่องที่กำหนด
 * สไตล์ใหม่ทุกตัวเรียกตัวนี้ — เพิ่มสไตล์ทีหลังจะได้เขียนแค่ "พื้นหลัง + กล่อง" ไม่ต้องทำ layout เอง
 * (renderPanel ตัวแรกไม่ได้ใช้ตัวนี้โดยตั้งใจ — มันถูกเคาะหน้าตาไปแล้ว ไม่แตะให้เพี้ยน)
 */
// qFactor = ขนาดฟอนต์เริ่มต้นเทียบกับ**ความกว้างกล่อง** — กล่องแคบ (แถบข้าง) ต้องใช้ค่าสูงกว่า
// ไม่งั้นได้ตัวหนังสือจิ๋วลอยอยู่กลางแถบสีใหญ่ๆ (เจอตอนทำแถบข้างครั้งแรก)
async function drawQuoteBlock(ctx, { x, y, w, h, quoteText, authorName, ink, sub, align = 'left', maxLines = 6, qFactor = 0.073, noMark = false, fontBold = 'Anakotmai', fontLight = 'AnakotmaiLight' }) {
  const pool     = noMark ? [] : existingMarks(OPEN_MARKS);
  const hasMark  = pool.length > 0;

  const qszMax = Math.max(22, Math.round(w * qFactor));
  // floor ผูกกับ qszMax เอง (ไม่ใช่ 18px คงที่) — กัน textSize preset บรรจบกันตอนคำคมยาว
  // เหมือน bug ที่เจอใน renderPlain (2026-08-11)
  const qszFloor = Math.round(qszMax * 0.6);
  let qsz = qszMax;
  let fit, lh, markH, markGap, nsz, authGap, blockH;
  for (;;) {
    fit     = fitFont(ctx, quoteText, w, qsz, maxLines, fontBold);
    fit.lines = fit.lines.flatMap(l => _breakLongLine(ctx, l, w, 1.0));
    lh      = fit.fontSize * 1.24;
    markH   = hasMark ? Math.round(fit.fontSize * 0.95) : 0;
    markGap = hasMark ? Math.round(fit.fontSize * 0.45) : 0;
    // ผูกกับความกว้างกล่อง ไม่ใช่ขนาดคำคม — เหตุผลเดียวกับ renderPanel
    nsz     = Math.max(14, Math.round(w * 0.033));
    authGap = Math.round(nsz * 1.1);
    blockH  = markH + markGap + fit.lines.length * lh + authGap + nsz;
    if (blockH <= h || qsz <= qszFloor) break;
    qsz = Math.round(qsz * 0.92);
  }

  const lineX = txt => align === 'right' ? x + w - lsWidth(ctx, txt, 1.0) : x;
  ctx.textBaseline = 'top';
  let ty = y + Math.round((h - blockH) / 2);

  if (hasMark) {
    const markImg = await loadMark(pool[Math.floor(Math.random() * pool.length)]);
    const markW   = (markImg.width / markImg.height) * markH;
    drawTinted(ctx, markImg, align === 'right' ? x + w - markW : x, ty, markW, markH, ink);
    ty += markH + markGap;
  }

  ctx.font = `bold ${fit.fontSize}px ${fontBold}`;
  ctx.fillStyle = ink;
  for (const l of fit.lines) { lsDraw(ctx, l, lineX(l), ty, 1.0); ty += lh; }

  ty += authGap;
  ctx.font = `${nsz}px ${fontLight}`;
  ctx.fillStyle = sub;
  lsDraw(ctx, authorName, align === 'right' ? x + w - lsWidth(ctx, authorName, 0.8) : x, ty, 0.8);
}

// ⛔ เคยมี renderDuotone แยกตัว — ยุบเข้า renderVariant เป็นแฟล็ก `duotone` แล้ว (2026-08-07)
//    เหตุ: มันคือ layout เดียวกับ ember เป๊ะ ต่างแค่ย้อมรูปก่อน · แยกไว้ทำให้ duotone มีแค่
//    ซ้าย/ขวา ทั้งที่ ember มีบน/ล่างด้วย · ยุบแล้ว duotone ได้ทุกการวางของ ember ฟรี
//
// ⛔ เคยมี renderSideBand (แถบสีแนวตั้งข้าง) — **ตัดทิ้ง 2026-08-07** user ตัดสินว่าไม่สวย
//    (คอลัมน์แคบทำให้ตัวหนังสือเล็กกว่าใบอื่นชัดเจน) อย่าใส่กลับโดยไม่ถามก่อน

/** matte — พื้นสีล้วน รูปลอยอยู่ข้างบนแบบมีขอบ คำคมอยู่ใต้รูป */
async function renderMatte(buf, { quoteText, authorName, saturation = 1.0, accentColor, inset = 0.06, font = null, textSize = 'm' }) {
  const base = accentColor || ORANGE;
  const fontBold  = font && PLAIN_FONTS[font] ? PLAIN_FONTS[font].quote  : 'Anakotmai';
  const fontLight = font && PLAIN_FONTS[font] ? PLAIN_FONTS[font].author : 'AnakotmaiLight';
  const sizeScale = QUOTE_SIZE_SCALE[textSize] ?? 1;
  const { ink, sub } = panelPalette(base);

  const meta = await sharp(buf).metadata();
  const W = meta.width, H = meta.height;
  const m     = Math.round(W * inset);
  const imgW  = W - m * 2;
  const imgH  = Math.round(H * 0.52);

  const work = await sharp(buf).modulate({ saturation })
    .resize(imgW, imgH, { fit: 'cover', position: 'attention' }).toBuffer();
  const img = await loadImage(work);

  const cv  = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, m, m, imgW, imgH);

  const boxY = m + imgH;
  // ไม่มีเครื่องหมายคำพูด — กรอบรูปที่ลอยอยู่ทำหน้าที่คั่นสายตาให้อยู่แล้ว
  // ใส่เพิ่มกลายเป็นสองอย่างแย่งกันเป็นจุดเริ่มต้น (user เคาะ 2026-08-07)
  await drawQuoteBlock(ctx, {
    x: m, y: boxY, w: imgW, h: H - boxY - m,
    quoteText, authorName, ink, sub, noMark: true,
    qFactor: 0.073 * sizeScale, fontBold, fontLight,
  });
  return { buffer: await toPng(cv), ext: 'png', vertical: 'bottom', side: 'left' };
}

// ── Layout: side — คอลัมน์คำคมด้านขวา ทำมาเพื่อ "ข้อความยาว" โดยเฉพาะ ─────────
// อ้างอิงการ์ดข่าวที่ user ส่งมา (2026-08-07): รูปคนเต็มใบย้อมเข้ม · ข้อความอยู่คอลัมน์ขวา
// ~ครึ่งใบ แบ่ง 2 ระดับ (เกริ่นตัวบาง + ประโยคเด็ดตัวหนาใหญ่) · ชื่อผู้พูดมุมล่างซ้ายใต้รูป
//
// ⚠️ อย่าสับสนกับ "แถบสีแนวตั้ง" ที่ตัดทิ้งไปเพราะคอลัมน์แคบทำให้ตัวหนังสือเล็กกว่าใบอื่น —
//    อันนี้ user ขอเองพร้อมตัวอย่าง โดยมีเงื่อนไขว่า **ต้องใหญ่** จึงกินความกว้างครึ่งใบ
//    และตัวอักษรใหญ่กว่าสไตล์อื่น ไม่ใช่แถบแคบแบบเดิม
//
// แบ่ง 2 ระดับด้วย **บรรทัดว่าง**: ก่อนบรรทัดว่าง = เกริ่น · หลังบรรทัดว่าง = ประโยคเด็ด
// ไม่มีบรรทัดว่าง = ทั้งก้อนเป็นประโยคเด็ด · ชื่อผู้พูดขึ้นบรรทัดใหม่ได้ (บรรทัดแรก = ชื่อ ตัวหนา)
async function renderSide(buf, { quoteText, authorName, saturation = 1.0, accentColor, duotone = false, align = 'right', font = null, textSize = 'm' }) {
  const onRight = align !== 'left';
  const accent = accentColor || ORANGE;
  // 2 ระดับตัวพิมพ์: lead/ชื่อ = ตัวหนา (fontBold) · intro/ตำแหน่ง = ตัวบาง (fontLight)
  const fontBold  = font && PLAIN_FONTS[font] ? PLAIN_FONTS[font].quote  : 'GSans';
  const fontLight = font && PLAIN_FONTS[font] ? PLAIN_FONTS[font].author : 'GSansLight';
  const sizeScale = QUOTE_SIZE_SCALE[textSize] ?? 1;
  const scrim  = scrimOf(accent);
  const meta   = await sharp(buf).metadata();
  const W = meta.width, H = meta.height;

  const prepped = await prepImage(buf, { saturation, duotone, accent });
  const img = await loadImage(await sharp(prepped).resize(W, H, { fit: 'cover', position: 'attention' }).toBuffer());
  const cv  = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);

  // scrim: บางทั้งใบ + เข้มขึ้นทางขวา (คอลัมน์ข้อความ) + ก้นภาพเข้มรองบล็อกชื่อ
  ctx.fillStyle = _rgbaOf(scrim.hex, 0.40); ctx.fillRect(0, 0, W, H);
  // ไล่เข้มไปทางฝั่งที่วางคอลัมน์ข้อความ (กลับข้างตาม align)
  const gx = onRight
    ? ctx.createLinearGradient(W * 0.28, 0, W, 0)
    : ctx.createLinearGradient(W * 0.72, 0, 0, 0);
  gx.addColorStop(0,    _rgbaOf(scrim.hex, 0));
  gx.addColorStop(0.45, _rgbaOf(scrim.hex, 0.70));
  gx.addColorStop(1,    _rgbaOf(scrim.hex, 0.92));
  ctx.fillStyle = gx; ctx.fillRect(0, 0, W, H);
  const gy = ctx.createLinearGradient(0, H, 0, H * 0.60);
  gy.addColorStop(0, _rgbaOf(scrim.hex, 0.92));
  gy.addColorStop(1, _rgbaOf(scrim.hex, 0));
  ctx.fillStyle = gy; ctx.fillRect(0, 0, W, H);

  const pad  = Math.round(W * 0.055);
  const colW = Math.round(W * 0.54) - pad;
  const colX = onRight ? W - pad - colW : pad;

  // แบ่งเกริ่น/ประโยคเด็ด
  const blocks = String(quoteText || '').split(/\n\s*\n/).map(t => t.trim()).filter(Boolean);
  const intro  = blocks.length > 1 ? blocks.slice(0, -1).join('\n') : '';
  const lead   = blocks.length ? blocks[blocks.length - 1] : '';

  // บล็อกชื่อผู้พูดล่างซ้าย — กันพื้นที่ไว้ก่อนค่อยคิดความสูงคอลัมน์
  const authorLines = String(authorName || '').split('\n').map(t => t.trim()).filter(Boolean);
  const nameSz = Math.max(15, Math.round(W * 0.026 * sizeScale));
  const roleSz = Math.max(13, Math.round(W * 0.021 * sizeScale));
  const ruleH  = Math.max(3, Math.round(W * 0.005));
  const authorH = authorLines.length
    ? ruleH + Math.round(nameSz * 0.9) + nameSz * 1.25 + Math.max(0, authorLines.length - 1) * roleSz * 1.45
    : 0;

  const markH  = Math.round(W * 0.075);
  const top    = Math.round(H * 0.11);
  const avail  = H - top - pad - Math.round(authorH * 0.45);   // บล็อกชื่ออยู่ซ้าย ทับกันได้บางส่วน

  // ย่อฟอนต์ทั้งชุดจนความสูงรวมพอดีคอลัมน์ (fitFont คุมแค่ความกว้าง)
  let introSz0 = Math.max(20, Math.round(W * 0.038 * sizeScale));
  let leadSz0  = Math.max(28, Math.round(W * 0.060 * sizeScale));
  let introFit = null, leadFit = null, introLh = 0, leadLh = 0, total = 0;
  for (let i = 0; i < 14; i++) {
    introFit = intro ? fitFont(ctx, intro, colW, introSz0, 8, fontLight) : { fontSize: introSz0, lines: [] };
    leadFit  = lead  ? fitFont(ctx, lead,  colW, leadSz0,  8, fontBold)  : { fontSize: leadSz0,  lines: [] };
    introLh  = introFit.fontSize * 1.42;
    leadLh   = leadFit.fontSize * 1.22;
    total = markH + Math.round(leadSz0 * 0.5)
          + introFit.lines.length * introLh
          + (intro && lead ? Math.round(leadFit.fontSize * 0.75) : 0)
          + leadFit.lines.length * leadLh;
    if (total <= avail) break;
    introSz0 = Math.round(introSz0 * 0.94);
    leadSz0  = Math.round(leadSz0 * 0.94);
  }

  // ข้อความสั้นกว่าคอลัมน์มาก → จัดกลางแนวตั้ง ไม่งั้นค้างอยู่หัวใบแล้วเหลือช่องโหว่ครึ่งใบ
  // (สไตล์นี้ทำมาเพื่อข้อความยาว แต่ผู้ใช้พิมพ์สั้นมาก็ต้องไม่พัง)
  let ty = total < avail * 0.62
    ? Math.max(pad, Math.round((H - Math.round(authorH * 0.5) - total) / 2))
    : top;
  const qm = await loadMark('double_open');
  drawTinted(ctx, qm, colX, ty, (qm.width / qm.height) * markH, markH, _mix(accent, WHITE, 0.55));
  ty += markH + Math.round(leadSz0 * 0.5);

  ctx.textBaseline = 'top';
  if (introFit.lines.length) {
    ctx.font = `${introFit.fontSize}px ${fontLight}`;
    ctx.fillStyle = 'rgba(255,255,255,0.90)';
    for (const l of introFit.lines) { lsDraw(ctx, l, colX, ty, 0.6); ty += introLh; }
    if (leadFit.lines.length) ty += Math.round(leadFit.fontSize * 0.75);
  }
  if (leadFit.lines.length) {
    ctx.font = `bold ${leadFit.fontSize}px ${fontBold}`;
    ctx.fillStyle = WHITE;
    for (const l of leadFit.lines) { lsDraw(ctx, l, colX, ty, 0.8); ty += leadLh; }
  }

  // ชื่อผู้พูด: ขีดสั้นสีแบรนด์ → ชื่อ (หนา) → ตำแหน่ง/บริบท (บาง)
  if (authorLines.length) {
    // อยู่ฝั่งตรงข้ามคอลัมน์เสมอ (คอลัมน์ขวา → ชื่อล่างซ้าย และกลับกัน)
    let ay = H - pad - authorH;
    const ruleW = Math.round(W * 0.06);
    const ax = onRight ? pad : W - pad;                       // จุดอ้างอิง: ซ้ายชิดซ้าย · ขวาชิดขวา
    const put = (text, sp) => {
      const w = lsWidth(ctx, text, sp);
      lsDraw(ctx, text, onRight ? ax : ax - w, ay, sp);
    };
    ctx.fillStyle = readableOnDark(accent, 4.5, scrim.lum);
    ctx.fillRect(onRight ? ax : ax - ruleW, ay, ruleW, ruleH);
    ay += ruleH + Math.round(nameSz * 0.9);
    ctx.font = `bold ${nameSz}px ${fontBold}`;
    ctx.fillStyle = WHITE;
    put(authorLines[0], 0.6);
    ay += nameSz * 1.25;
    ctx.font = `${roleSz}px ${fontLight}`;
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    for (const l of authorLines.slice(1)) { put(l, 0.5); ay += roleSz * 1.45; }
  }

  return { buffer: await toPng(cv), ext: 'png', vertical: 'top', side: onRight ? 'right' : 'left' };
}

/** '#rrggbb' + alpha → rgba() */
function _rgbaOf(hex, a) { return `rgba(${_rgbTriplet(hex)},${a})`; }

// ── Styles ───────────────────────────────────────────────────────────────────
const ember = (side, vertical, extra = {}) => (buf, opts) =>
  renderVariant(buf, { ...opts, side, vertical, markScale: 0.7, gradDark: 0.98, ...extra });

// ── quote-2-center: ข้อความกลางภาพ, BG หรี่ + ดำคลุม 75%, Google Sans (มีหัว) ──
// supersample 2x แล้วย่อ = ขอบคม. ใช้ fitFont/lsDraw ตัวเดียวกับ quote-1
async function renderCenter(buf, { quoteText, authorName, saturation = 1.0, accentColor, duotone = false, font = null, textSize = 'm' }) {
  const fontBold  = font && PLAIN_FONTS[font] ? PLAIN_FONTS[font].quote  : 'GSans';
  const fontLight = font && PLAIN_FONTS[font] ? PLAIN_FONTS[font].author : 'AnakotmaiLight';
  const sizeScale = QUOTE_SIZE_SCALE[textSize] ?? 1;
  const SS = 2, OVERLAY = 0.75;
  const meta = await sharp(buf).metadata();
  const W = meta.width, H = meta.height;

  const prepped = await prepImage(buf, { saturation, duotone, accent: accentColor || ORANGE });
  const work = await sharp(prepped).resize(W * SS, H * SS, { fit: 'cover' }).toBuffer();
  const img  = await loadImage(work);
  const cv   = createCanvas(W * SS, H * SS);
  const ctx  = cv.getContext('2d');
  ctx.scale(SS, SS);

  ctx.drawImage(img, 0, 0, W, H);
  // ดำคลุมทั้งใบ — ย้อมสีแบรนด์ให้เข้าชุดกับ scrim ของสไตล์อื่น (ผสมดำ SCRIM_MIX ก่อนเสมอ)
  ctx.fillStyle = `rgba(${scrimOf(accentColor || ORANGE).rgb},${OVERLAY})`;
  ctx.fillRect(0, 0, W, H);

  const padX = Math.round(W * 0.11);
  const startSz = Math.max(40, Math.round(W * 0.085 * sizeScale));
  const { fontSize: qsz, lines } = fitFont(ctx, quoteText, W - padX * 2, startSz, 6, fontBold);
  const lh    = qsz * 1.22;
  const nsz   = Math.max(16, Math.round(W * 0.028));
  const qmsz  = Math.round(W * 0.11);
  const qmGap = Math.round(qsz * 0.5);
  const blockH = qmsz + qmGap + lines.length * lh + nsz * 2.2;
  let ty = Math.round((H - blockH) / 2);

  // เครื่องหมายคำพูด (รูป) กลางบน
  ctx.textBaseline = 'top';
  const qm = await loadMark('white_close');
  ctx.drawImage(qm, Math.round((W - qmsz) / 2), ty, qmsz, qmsz);
  ty += qmsz + qmGap;

  // quote กลาง
  ctx.font = `bold ${qsz}px ${fontBold}`;
  for (const l of lines) {
    const w = lsWidth(ctx, l, 1.0);
    ctx.fillStyle = WHITE;
    lsDraw(ctx, l, (W - w) / 2, ty, 1.0);
    ty += lh;
  }

  // author กลาง
  ty += nsz * 0.6;
  ctx.font = `${nsz}px ${fontLight}`; ctx.fillStyle = 'rgba(255,255,255,0.85)';   // author ไม่มีหัวเสมอ
  const aw = lsWidth(ctx, authorName, 0.8);
  lsDraw(ctx, authorName, (W - aw) / 2, ty, 0.8);

  const big = await toPng(cv);
  const out = await sharp(big).resize(W, H).png().toBuffer();   // ย่อ 2x → 1x ขอบคม
  return { buffer: out, ext: 'png', vertical: 'center', side: 'center' };
}

// ── plain — การ์ดคำคม **ไม่มีรูป** พื้นเป็นสี CI ล้วน (2026-08-10) ─────────────
//
// ต่างจากสไตล์อื่นทุกตัวตรงที่ **ไม่รับ buffer** — ไม่มีรูป = ไม่มีขนาดมาจากไฟล์
// ผู้เรียกต้องบอก width/height เอง (ฝั่งเว็บให้ผู้ใช้เลือกสัดส่วน 1:1 / 4:5 / 9:16)
// → มันจึงอยู่นอก STYLES ที่ signature เป็น (buf, opts) และห้ามตกใน random pool
//   ไม่งั้นคนกดคำคมจากรูปแล้วสุ่มได้ plain = รูปที่เลือกมาโดนทิ้งเงียบๆ
//
// bg: 'solid' = สีทึบล้วน · 'gradient' = ไล่เฉด · 'mark' = ทึบ + เครื่องหมายคำพูดจางเป็นลาย
//     'logo' = ทึบ + **ลายน้ำขององค์กร** จางเป็นลาย (ต้องส่ง watermarkPath มาด้วย ไม่งั้นตกเป็น solid)
//
// ⚠️ ทิศ gradient ต้องวิ่ง **หนี** สีตัวอักษรเสมอ: ink ขาว → ปลายเข้มลง · ink ดำ → ปลายสว่างขึ้น
//    ไล่ผิดทาง = สี CI อ่อน (ink ดำ) เจอปลายเข้ม แล้วตัวหนังสือจม (เหตุผลเดียวกับ panelPalette:
//    contrastText() คำนวณจากสีเดียว มันไม่รู้ว่าปลาย gradient ไปทางไหน)
// ลายพื้นมุมขวาล่าง — ค่าที่ user เคาะจากตัวอย่างที่ทำมาให้ดูเอง (2026-08-11):
// **ทั้งดวงอยู่ในกรอบ ไม่โดนขอบตัด · opacity 10% · สีจริงของไฟล์ ไม่ย้อมสี**
// (ก่อนนี้ลองย้อมเทา/ย้อมสีตัวอักษร + โผล่จากขอบ → user ตีตกทั้งชุด "อ่านเป็นเงา")
const WM = { scale: 0.45, alpha: 0.10, margin: 0.06 };

// ⛔ เคยเว้นแถบก้นการ์ด 16% ไว้แปะโลโก้ (2026-08-11 เช้า) — **ยกเลิกแล้วเย็นวันเดียวกัน**
//    ที่ user รู้สึกว่าข้อความ "ต่ำไป" จริงๆ แล้วเกิดจาก **พรีวิวในโมดัลโดนหั่นหัวท้าย**
//    (ดู QuoteGeneratorModal — `w-full` บนการ์ด 4:5) ไม่ใช่ตำแหน่งข้อความ · ข้อความกลับไปกลางการ์ด
//    → อย่าเพิ่มแถบกลับโดยไม่ถามก่อน

// ขนาดตัวอักษร = สัดส่วนต่อความกว้างการ์ด (เป็น **จุดตั้งต้น** — ข้อความยาวยังถูกย่อลงอีกได้)
// เดิม {0.072, 0.092, 0.115} ห่างกันแค่ ~25-28% — user บอกว่ายังต่างกันน้อย ดันขึ้นเป็น ~40-48%
// ให้สัดส่วนตรงกับ QUOTE_SIZE_SCALE ของการ์ดมีรูป (2026-08-11)
const PLAIN_SIZES = { s: 0.062, m: 0.092, l: 0.130 };

// จำนวนบรรทัดสูงสุดต่อ preset — ตัวใหญ่ต้องรับบรรทัดเยอะกว่าได้ ไม่งั้นคำคมยาว (>~90 ตัว) จะโดน
// fitFont หรี่ลงจนชน 6 บรรทัดเท่ากันหมดทุก preset (m กับ l ออกมาเท่ากันเป๊ะ — bug ที่ user เจอ 2026-08-11)
const PLAIN_MAX_LINES = { s: 5, m: 6, l: 7 };

/** สุ่ม 1 ตัวจาก array · array ว่าง = null */
const pickRandom = arr => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);

async function renderPlain({
  quoteText, authorName = '', accentColor, width = 1080, height = 1350, bg = 'solid',
  watermarkPath = null, font = 'anakotmai', textSize = 'm',
}) {
  const fonts = PLAIN_FONTS[font] || PLAIN_FONTS.anakotmai;
  const sizeFactor = PLAIN_SIZES[textSize] || PLAIN_SIZES.m;
  const maxLines = PLAIN_MAX_LINES[textSize] || PLAIN_MAX_LINES.m;
  const SS = 2;                               // supersample แล้วย่อ = ขอบตัวอักษรคม (เหมือน renderCenter)
  const base = accentColor || ORANGE;
  const { ink, sub } = panelPalette(base);
  const W = Math.round(width), H = Math.round(height);

  const cv  = createCanvas(W * SS, H * SS);
  const ctx = cv.getContext('2d');
  ctx.scale(SS, SS);

  if (bg === 'gradient') {
    // ไล่ลง**เข้ม**เสมอ (ไม่ไล่ไปหาขาว — พื้นสีอ่อนไล่ไปขาวแล้วการ์ดดูซีดไม่มีสี)
    // ระยะต่างกันตามสีตัวอักษร: ink ขาวเข้มได้เต็มที่ · ink ดำเข้มได้แค่ 0.16 ก่อนคอนทราสต์หลุด AA
    // (#ff6a13 ที่ 0.16 → 5.3:1 · ที่ 0.25 เหลือ 4.3 = ต่ำกว่า 4.5 แล้ว — อย่าดันขึ้น)
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, _mix(base, WHITE, ink === WHITE ? 0.00 : 0.06));
    grad.addColorStop(1, _mix(base, BLACK, ink === WHITE ? 0.42 : 0.16));
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = base;
  }
  ctx.fillRect(0, 0, W, H);

  // ลายพื้นมุมขวาล่าง — **ทั้งดวงอยู่ในกรอบ ไม่โดนขอบตัด · opacity 10% · สีจริงไม่ย้อม**
  // (user เคาะ 2026-08-11 จากตัวอย่างที่ทำมาให้ดูเอง — แบบย้อมสี/โผล่จากขอบถูกตีตกหมด)
  //
  // bg='mark' = เครื่องหมายคำพูด (สุ่มทุกใบ ตามที่ user สั่ง 2026-08-11) · bg='logo' = ลายน้ำองค์กร
  const patternName = bg === 'mark' ? pickRandom(existingMarks(['big_open', ...OPEN_MARKS])) : null;
  const patternImg =
    patternName ? await loadMark(patternName)
    // ⛔ ห้าม .catch(() => null) ตรงนี้ — เคยเขียนแบบนั้นแล้วไฟล์ลายน้ำที่ path เพี้ยน
    //    (โครงโฟลเดอร์เปลี่ยนเป็น org_<id>/ 2026-08-10) ทำให้ได้การ์ด**พื้นสีเปล่า**เงียบๆ
    //    ผู้ใช้เลือก "ลายน้ำ" มาแล้ว ได้การ์ดไม่มีลายน้ำ = ผิดกว่าขึ้น error ให้เห็น
    : bg === 'logo' && watermarkPath ? await loadImage(watermarkPath)
    : null;

  // จองพื้นที่ก้นการ์ดไว้ให้ลายน้ำ **ก่อน** จัดกลางข้อความ — เดิม maxH หารเท่า H ทั้งใบ
  // ทำให้ข้อความยาวๆ ไหลไปทับลายน้ำมุมขวาล่างได้ (2026-08-11 user สั่งเลื่อนขึ้น)
  //
  // ⛔ จองเต็ม ph+margin*2 รอบแรกดันบล็อกขึ้นสูงเกิน — ลายน้ำอยู่แค่มุมขวาล่าง ไม่ได้กินเต็มความกว้าง
  //    การ์ด จึงไม่ต้องกันพื้นที่เท่าความสูงจริงของมัน (user บ่นว่าเหลือพื้นที่ว่างล่างเยอะเกิน)
  //    ครึ่งเดียวก็พอกันไม่ให้ข้อความยาวไหลไปชน (2026-08-11 รอบ 2)
  let wmReserve = 0;
  if (patternImg) {
    const m  = Math.round(W * WM.margin);
    const pw = Math.round(W * WM.scale);
    const ph = Math.round(pw * (patternImg.height / patternImg.width));
    ctx.globalAlpha = WM.alpha;
    ctx.drawImage(patternImg, W - pw - m, H - ph - m, pw, ph);
    ctx.globalAlpha = 1;
    wmReserve = Math.round((ph + m * 2) * 0.5);
  }

  // ── ข้อความ — จัดกลางเฉพาะพื้นที่**เหนือแถบลายน้ำ** ────────────────────────
  const padX = Math.round(W * 0.10);
  const padY = Math.round(H * 0.07);
  const maxW = W - padX * 2;
  const maxH = H - padY * 2 - wmReserve;

  // ⚠️ **ไม่สุ่ม** เครื่องหมายนำหน้าข้อความ — ตัวนี้เป็นองค์ประกอบของงานพิมพ์ ต้องนิ่ง
  //    (ที่สุ่มคือ **ลายพื้น** ด้านหลัง ซึ่งเป็นคนละตัวกัน)
  const pool    = existingMarks(['double_open', ...OPEN_MARKS]);
  const markImg = pool.length ? await loadMark(pool[0]) : null;

  const nsz     = Math.max(16, Math.round(W * 0.030));
  const authGap = Math.round(nsz * 1.3);

  // fitFont ย่อฟอนต์ได้แค่ 65% แล้วหยุด (ที่เหลือมันปล่อยให้บรรทัดงอกแทน) — คำคมยาวสุด 300 ตัว
  // ที่ 4:5 จึงล้นก้นการ์ดได้ · ย่อ startSz ต่อเองจนบล็อกสูงไม่เกินกรอบ (สไตล์ที่มีรูปไม่เจอปัญหานี้
  // เพราะกล่องข้อความเล็กกว่าและ drawQuoteBlock มีลูปย่อของมันเอง)
  //
  // ⛔ floor เดิมเป็นค่าคงที่ 24px เท่ากันทุก textSize — คำคมยาวดันให้ลูปนี้หดจน m กับ l
  //    มาบรรจบที่ค่าเดียวกัน (เลือก l ก็ได้ตัวเท่า m) เพราะ start ถูกหดทบไปเรื่อยๆ ไม่มีเพดานกันตาม
  //    preset ที่เลือกไว้ต้นทาง → ผูก floor กับ sizeFactor เอง กันไม่ให้ preset ถูกบีบจนเท่ากัน
  //    (2026-08-11 user สังเกตว่า m/l ต่างกันน้อยมาก)
  const startMax   = Math.max(40, Math.round(W * sizeFactor));
  const startFloor = Math.round(startMax * 0.6);
  let qsz, lines, lh, markH, markGap, blockH;
  for (let start = startMax; ; start = Math.round(start * 0.92)) {
    ({ fontSize: qsz, lines } = fitFont(ctx, quoteText, maxW, start, maxLines, fonts.quote));
    lh      = qsz * 1.24;
    markH   = markImg ? Math.round(qsz * 1.05) : 0;
    markGap = markImg ? Math.round(qsz * 0.55) : 0;
    blockH  = markH + markGap + lines.length * lh + (authorName ? authGap + nsz : 0);
    if (blockH <= maxH || start <= startFloor) break;
  }

  // จุดกึ่งกลางเป๊ะ (0.5) รู้สึกลอยขึ้นบนเสมอ — เครื่องหมายคำพูดมีที่ว่างในไฟล์ภาพเหนือเนื้อ
  // ตัวจริง ตาจึงอ่านบล็อกว่า "เริ่มต่ำกว่าที่คำนวณ" ถ่วงลงนิดด้วย 0.56 (user บ่นเหลือที่ว่างล่างเยอะ)
  ctx.textBaseline = 'top';
  let ty = Math.round((H - wmReserve - blockH) * 0.56);

  if (markImg) {
    const markW = Math.round((markImg.width / markImg.height) * markH);
    drawTinted(ctx, markImg, Math.round((W - markW) / 2), ty, markW, markH, ink);
    ty += markH + markGap;
  }

  ctx.font = `bold ${qsz}px ${fonts.quote}`;
  ctx.fillStyle = ink;
  for (const l of lines) {
    lsDraw(ctx, l, (W - lsWidth(ctx, l, 1.0)) / 2, ty, 1.0);
    ty += lh;
  }

  if (authorName) {
    ty += authGap;
    ctx.font = `${nsz}px ${fonts.author}`;
    ctx.fillStyle = sub;
    lsDraw(ctx, authorName, (W - lsWidth(ctx, authorName, 0.8)) / 2, ty, 0.8);
  }

  const out = await sharp(await toPng(cv)).resize(W, H).png().toBuffer();
  return { buffer: out, ext: 'png', vertical: 'center', side: 'center' };
}

// คีย์ = <finish>-<layout> · finish = shade (เงา) | solid (ทึบ) | duo (ดูโอโทน)
//
// ⚠️ คีย์เดิม 8 ตัว (quote-1-* / quote-2-*) ห้ามลบ — `post_episode_media.quote_style` ของการ์ด
//    ที่ทำไปแล้วเก็บคีย์พวกนี้ไว้ · เก็บเป็น alias ชี้ไปคีย์ใหม่ที่ผลลัพธ์เหมือนกันเป๊ะ
const STYLES = {
  // ── เงา (scrim ย้อมสีแบรนด์) ────────────────────────────────────────────────
  'shade-bottom-left':  ember('left',  'bottom', { markExtraGap: 0.65, markScale: 0.84 }),
  'shade-bottom-right': ember('right', 'bottom', { markExtraGap: 0.65, markScale: 0.84 }),
  'shade-top-left':     ember('left',  'top',    { noMark: true }),
  'shade-top-right':    ember('right', 'top',    { noMark: true }),
  'shade-pillar':       (buf, opts) => renderBorder(buf, opts),
  'shade-frame':        (buf, opts) => renderBorder2(buf, opts),
  'shade-center':       (buf, opts) => renderCenter(buf, opts),
  'shade-side-left':    (buf, opts) => renderSide(buf, { ...opts, align: 'left' }),
  'shade-side-right':   (buf, opts) => renderSide(buf, { ...opts, align: 'right' }),

  // ── ทึบ (แถบสีแบรนด์ opacity 0.90) ─────────────────────────────────────────
  'solid-bottom-left':  (buf, opts) => renderPanel(buf, { ...opts, panelAt: 'bottom', align: 'left' }),
  'solid-bottom-right': (buf, opts) => renderPanel(buf, { ...opts, panelAt: 'bottom', align: 'right' }),
  'solid-top-left':     (buf, opts) => renderPanel(buf, { ...opts, panelAt: 'top',    align: 'left' }),
  'solid-top-right':    (buf, opts) => renderPanel(buf, { ...opts, panelAt: 'top',    align: 'right' }),
  'solid-matte':        (buf, opts) => renderMatte(buf, opts),

  // ── ดูโอโทน (ย้อมรูปทั้งใบ) — layout ชุดเดียวกับเงา ────────────────────────
  'duo-bottom-left':    ember('left',  'bottom', { markExtraGap: 0.65, markScale: 0.84, duotone: true }),
  'duo-bottom-right':   ember('right', 'bottom', { markExtraGap: 0.65, markScale: 0.84, duotone: true }),
  'duo-top-left':       ember('left',  'top',    { noMark: true, duotone: true }),
  'duo-top-right':      ember('right', 'top',    { noMark: true, duotone: true }),
  'duo-pillar':         (buf, opts) => renderBorder(buf,  { ...opts, duotone: true }),
  'duo-frame':          (buf, opts) => renderBorder2(buf, { ...opts, duotone: true }),
  'duo-center':         (buf, opts) => renderCenter(buf,  { ...opts, duotone: true }),
  'duo-side-left':      (buf, opts) => renderSide(buf,    { ...opts, duotone: true, align: 'left' }),
  'duo-side-right':     (buf, opts) => renderSide(buf,    { ...opts, duotone: true, align: 'right' }),

};

// คีย์เก่า → คีย์ใหม่ · การ์ดเก่าเปิดได้เหมือนเดิม ห้ามลบแถวไหนออก
const LEGACY_STYLE_ALIAS = {
  'quote-1-ember-bottom-left':  'shade-bottom-left',
  'quote-1-ember-bottom-right': 'shade-bottom-right',
  'quote-1-ember-top-left':     'shade-top-left',
  'quote-1-ember-top-right':    'shade-top-right',
  'quote-1-pillar-left':        'shade-pillar',
  'quote-1-frame-right':        'shade-frame',
  'quote-2-center':             'shade-center',
  // สไตล์ AI ถอดออก 2026-08-10 — คีย์เก่าตกเป็นสไตล์คงที่ ไม่ใช่สุ่ม (render ซ้ำต้องได้ผลเดิม)
  'quote-1-ember-ai':           'shade-bottom-left',
  'ai':                         'shade-bottom-left',
};
const RANDOM_KEYS = Object.keys(STYLES);
const STYLE_KEYS  = Object.keys(STYLES);

async function renderQuoteStyle(styleKey, sourceBuffer, opts) {
  const raw = (!styleKey || styleKey === 'random')
    ? RANDOM_KEYS[Math.floor(Math.random() * RANDOM_KEYS.length)]
    : styleKey;
  const key = LEGACY_STYLE_ALIAS[raw] || raw;   // การ์ดเก่าส่งคีย์เดิมมา แปลงก่อนเสมอ
  const fn = STYLES[key];
  if (!fn) throw new Error(`Unknown style: ${key}`);
  return fn(sourceBuffer, { ...opts, authorName: opts.authorName || '' });
}

function parseStyle(input) {
  const s = (input || '').trim();
  if (!s || s === 'สุ่ม' || s === 'สุม' || s === 'random')
    return RANDOM_KEYS[Math.floor(Math.random() * RANDOM_KEYS.length)];
  const aliased = LEGACY_STYLE_ALIAS[s] || s;
  const match = STYLE_KEYS.find(k => k.toLowerCase() === aliased.toLowerCase());
  return match || null;
}

// renderPanel/panelPalette ยัง**ไม่อยู่ใน STYLES** — ยังเป็นตัวอย่างให้ดูก่อนเคาะ
// เคาะเมื่อไหร่ค่อยเติมคีย์ใน STYLES แล้วมันจะตกเข้า random pool เอง
/**
 * ชั้นข้อความ **โปร่งใส** ขนาดเท่าเฟรมวิดีโอ — สำหรับ ffmpeg เอาไปซ้อนบนคลิป
 *
 * ทำไมต้องอยู่ในไฟล์นี้ ไม่ใช่ไฟล์ใหม่: ตัวจัดข้อความจริง (`fitFont` ย่อฟอนต์ให้พอบรรทัด ·
 * `wrapText`/`graphemes` ตัดคำไทยแบบ grapheme-aware · `lsDraw` letter-spacing) เป็น private
 * ของโมดูลนี้ทั้งหมด · ถ้าไปเขียนใหม่ข้างนอก = renderer ตัวที่สอง ที่จะเพี้ยนจากการ์ดคำคมทันที
 * ที่ใครสักคนแก้ไฟล์นี้ (กติกาข้อ 16: renderer มีตัวเดียว)
 *
 * ต่างจาก `renderQuoteStyle()` ตรงที่ตัวนั้นรับ **รูปพื้นหลัง** แล้วคืนการ์ดทึบ
 * ส่วนตัวนี้ไม่มีพื้นหลัง — คืน PNG ที่โปร่งทุกที่ยกเว้นแถบมืดหลังข้อความ
 *
 * @param {number} width   ต้องเป็นขนาด**ที่ตาเห็น** ไม่ใช่ขนาด coded (คลิปแนวตั้งจากมือถือ
 * @param {number} height  เก็บ rotation ไว้ใน metadata — ดู utils/videoQuoteOverlay.js)
 * @param {{quoteText:string, authorName?:string, position?:'top'|'center'|'bottom',
 *          scrimAlpha?:number, noMark?:boolean}} opts
 * @returns {Promise<Buffer>} PNG โปร่งใส
 */
async function renderQuoteOverlay(width, height, {
  quoteText, authorName = '', position = 'bottom', scrimAlpha = 0.62, noMark = false,
} = {}) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const pad = Math.round(width * 0.07);
  const bandH = Math.round(height * 0.34);
  const bandY = position === 'top' ? 0
    : position === 'center' ? Math.round((height - bandH) / 2)
    : height - bandH;

  // เขตที่แพลตฟอร์มเอา UI มาทับ — Reels/TikTok วางแคปชัน+ปุ่มไลก์ที่ขอบล่าง
  // และเวลา/แบตเตอรี่อยู่ขอบบน · **แถบมืดยังลากถึงขอบเหมือนเดิม** (ไม่งั้นเห็นเป็นเส้นตัด)
  // แต่ร่นเฉพาะ "กล่องข้อความ" เข้ามา ข้อความจึงไม่ไปนอนใต้ปุ่มของแอป
  const safeBottom = position === 'bottom' ? Math.round(height * 0.12) : 0;
  const safeTop = position === 'top' ? Math.round(height * 0.06) : 0;

  // แถบมืดหลังข้อความ — คลิปมีภาพเคลื่อนไหว ตัวอักษรขาวล้วนอ่านไม่ออกเป็นช่วงๆ
  // ขอบด้านที่ติดกลางเฟรมไล่จาง ไม่ให้เห็นเป็นเส้นตัดตรงๆ
  const grad = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
  const stops = position === 'top'
    ? [[0, scrimAlpha], [0.65, scrimAlpha * 0.75], [1, 0]]
    : position === 'center'
      ? [[0, 0], [0.25, scrimAlpha], [0.75, scrimAlpha], [1, 0]]
      : [[0, 0], [0.35, scrimAlpha * 0.75], [1, scrimAlpha]];
  for (const [at, a] of stops) grad.addColorStop(at, `rgba(0,0,0,${a})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, bandY, width, bandH);

  await drawQuoteBlock(ctx, {
    x: pad, y: bandY + safeTop, w: width - pad * 2, h: bandH - safeBottom - safeTop,
    quoteText, authorName,
    ink: '#ffffff', sub: 'rgba(255,255,255,0.82)',
    align: 'left', maxLines: 4, noMark,
  });

  return toPng(canvas);
}

module.exports = {
  renderQuoteStyle, parseStyle, FRAME_RIGHT, renderQuoteOverlay,
  renderPlain,           // ไม่มีรูป — signature ต่างจาก STYLES (ไม่รับ buffer) จึงเรียกตรง
  renderPanel, renderMatte, panelPalette, LEGACY_STYLE_ALIAS,
  renderVariant, _mix,   // export ไว้ทดลอง scrimMix — ยังไม่มีสไตล์ไหนใน STYLES ใช้
};
