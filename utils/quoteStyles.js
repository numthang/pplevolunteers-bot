// utils/quoteStyles.js — Quote image styles
const sharp  = require('sharp');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path   = require('path');
const fs     = require('fs');
const { analyzeLayout } = require('../services/aiLayout');

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
async function renderVariant(buf, { quoteText, authorName, side = 'left', vertical = 'bottom', markScale = 1.0, gradDark = 0.95, saturation = 0.15, fontBold = 'GSans', fontLight = 'AnakotmaiLight', accentColor, markExtraGap = 0, markAfterText = false, noMark = false, scrimMix = SCRIM_MIX }) {
  const accent = accentColor || ORANGE;
  const isRight = side === 'right';
  const isTop   = vertical === 'top';

  const work = await sharp(buf).modulate({ saturation }).toBuffer();
  const img  = await loadImage(work);
  const W = img.width, H = img.height;
  const cv  = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);

  const pad    = Math.round(Math.min(W, H) * 0.055);
  const barW   = Math.max(2, Math.round(W * 0.0024));
  const barGap = Math.round(pad * 0.5);
  const qsz    = Math.max(36, Math.round(W * 0.065));
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
async function renderBorder(buf, { quoteText, authorName, saturation = 0.15, accentColor }) {
  const accent = accentColor || ORANGE;
  const work = await sharp(buf).modulate({ saturation }).toBuffer();
  const img  = await loadImage(work);
  const W = img.width, H = img.height;
  const cv  = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);

  const pad  = Math.round(Math.min(W, H) * 0.055);
  const qsz  = Math.max(36, Math.round(W * 0.065));
  const nsz  = Math.max(16, Math.round(W * 0.030));

  // quote_border.png 698x591 — V-bar spans y 25%–100%, text area x ≈ 24%
  const borderImg = await loadMark('frame_left');

  const maxW7   = W * 0.80;
  const { fontSize: qszFit, lines } = fitFont(ctx, quoteText, maxW7, qsz, 4, 'GSans');
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
  ctx.font = `bold ${qszFit}px GSans`;
  let ty = textBlockTop;
  for (const l of lines) {
    ctx.fillStyle = WHITE; lsDraw(ctx, l, textX, ty, 1.0);
    ty += lh;
  }

  ty += nsz * 0.5;
  ctx.font = `${nsz}px AnakotmaiLight`; ctx.fillStyle = readableOnDark(accent, 6.2, scrim.lum);
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
async function renderBorder2(buf, { quoteText, authorName, saturation = 0.15, accentColor }) {
  const accent = accentColor || ORANGE;
  const work = await sharp(buf).modulate({ saturation }).toBuffer();
  const img  = await loadImage(work);
  const W = img.width, H = img.height;
  const cv  = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);

  const pad  = Math.round(Math.min(W, H) * 0.055);
  const qsz  = Math.max(36, Math.round(W * 0.065));
  const nsz  = Math.max(16, Math.round(W * 0.030));

  const maxW8   = W * 0.80;
  const { fontSize: qszFit, lines } = fitFont(ctx, quoteText, maxW8, qsz, 4, 'GSans');
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

  ctx.font = `bold ${qszFit}px GSans`;
  const widest = Math.max(...lines.map(l => lsWidth(ctx, l, 1.0)));

  ctx.font = `${nsz}px AnakotmaiLight`;
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
  ctx.font = `bold ${qszFit}px GSans`;
  let ty = quoteTop;
  for (const l of lines) {
    ctx.fillStyle = WHITE; lsDraw(ctx, l, textRight - lsWidth(ctx, l, 1.0), ty, 1.0);
    ty += lh;
  }

  ctx.font = `${nsz}px AnakotmaiLight`;
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

// fade = สัดส่วนของความสูงภาพที่ให้รูป "จาง" เข้าหาแถบสี (0 = ขอบตัดคม)
// ⚠️ โซน fade อยู่**นอก**แถบทึบเสมอ ตัวหนังสือไม่เคยตกลงไปในโซนนี้ — คอนทราสต์จึงยัง
//    คำนวณจากสีทึบล้วนเหมือนเดิม ถ้าวันไหนย้ายข้อความเข้าโซน fade ต้องคิดคอนทราสต์ใหม่ทั้งหมด
async function renderPanel(buf, { quoteText, authorName, saturation = 1.0, accentColor, imgRatio = 0.65, panelAt = 'bottom', fade = 0, align = 'left' }) {
  const accent = accentColor || ORANGE;
  const { panel, ink, sub } = panelPalette(accent);

  const meta = await sharp(buf).metadata();
  const W = meta.width, H = meta.height;
  const panelH = Math.round(H * (1 - imgRatio));
  const imgH   = H - panelH;
  const imgY   = panelAt === 'bottom' ? 0 : panelH;
  const panelY = panelAt === 'bottom' ? imgH : 0;

  // ครอปด้วย 'attention' ให้ sharp เลือกโซนที่น่าสนใจเอง — แถบทึบกินพื้นที่ไป 1/3
  // ครอปกลางเฉยๆ มีสิทธิ์ตัดหัวคนทิ้ง
  const work = await sharp(buf).modulate({ saturation })
    .resize(W, imgH, { fit: 'cover', position: 'attention' }).toBuffer();
  const img = await loadImage(work);

  const cv  = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, imgY, W, imgH);
  ctx.fillStyle = panel;
  ctx.fillRect(0, panelY, W, panelH);

  // รอยต่อจาง — ไล่จากโปร่งใสฝั่งรูป ไปทึบสนิทตรงขอบแถบ
  const fadeH = Math.round(H * fade);
  if (fadeH > 0) {
    const rgb = _rgbTriplet(panel);
    const from = panelAt === 'bottom' ? panelY - fadeH : panelY + panelH + fadeH;
    const to   = panelAt === 'bottom' ? panelY : panelY + panelH;
    const g = ctx.createLinearGradient(0, from, 0, to);
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(1, `rgba(${rgb},1)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, Math.min(from, to), W, fadeH);
  }

  const padX    = Math.round(W * 0.075);
  const padY    = Math.round(panelH * 0.15);
  const nsz     = Math.max(15, Math.round(W * 0.028));
  const markH   = Math.round(panelH * 0.16);
  const markGap = Math.round(panelH * 0.07);
  const authGap = Math.round(nsz * 1.1);
  const maxW    = W - padX * 2;

  const pool    = existingMarks(OPEN_MARKS);
  const hasMark = pool.length > 0;
  const effMarkH = hasMark ? markH : 0;
  const effMarkGap = hasMark ? markGap : 0;

  // ย่อจนบล็อกทั้งก้อนลงแถบได้ — fitFont คุมความกว้าง ลูปนี้คุมความสูง
  let qsz = Math.max(24, Math.round(W * 0.062));
  let fit, lh, blockH;
  for (;;) {
    fit = fitFont(ctx, quoteText, maxW, qsz, 6, 'Anakotmai');
    lh  = fit.fontSize * 1.24;
    blockH = effMarkH + effMarkGap + fit.lines.length * lh + authGap + nsz;
    if (blockH <= panelH - padY * 2 || qsz <= 20) break;
    qsz = Math.round(qsz * 0.92);
  }

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

  ctx.font = `bold ${fit.fontSize}px Anakotmai`;
  ctx.fillStyle = ink;
  for (const l of fit.lines) {
    lsDraw(ctx, l, isRight ? right - lsWidth(ctx, l, 1.0) : padX, ty, 1.0);
    ty += lh;
  }

  ty += authGap;
  ctx.font = `${nsz}px AnakotmaiLight`;
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
async function drawQuoteBlock(ctx, { x, y, w, h, quoteText, authorName, ink, sub, align = 'left', maxLines = 6, qFactor = 0.073 }) {
  const pool     = existingMarks(OPEN_MARKS);
  const hasMark  = pool.length > 0;

  let qsz = Math.max(22, Math.round(w * qFactor));
  let fit, lh, markH, markGap, nsz, authGap, blockH;
  for (;;) {
    fit     = fitFont(ctx, quoteText, w, qsz, maxLines, 'Anakotmai');
    lh      = fit.fontSize * 1.24;
    markH   = hasMark ? Math.round(fit.fontSize * 0.95) : 0;
    markGap = hasMark ? Math.round(fit.fontSize * 0.45) : 0;
    nsz     = Math.max(14, Math.round(fit.fontSize * 0.42));
    authGap = Math.round(nsz * 1.1);
    blockH  = markH + markGap + fit.lines.length * lh + authGap + nsz;
    if (blockH <= h || qsz <= 18) break;
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

  ctx.font = `bold ${fit.fontSize}px Anakotmai`;
  ctx.fillStyle = ink;
  for (const l of fit.lines) { lsDraw(ctx, l, lineX(l), ty, 1.0); ty += lh; }

  ty += authGap;
  ctx.font = `${nsz}px AnakotmaiLight`;
  ctx.fillStyle = sub;
  lsDraw(ctx, authorName, align === 'right' ? x + w - lsWidth(ctx, authorName, 0.8) : x, ty, 0.8);
}

/**
 * duotone — ย้อมรูปทั้งใบเป็น 2 โทนที่แตกจาก base แล้วไล่เข้มที่ก้นภาพ
 *
 * นี่คือ "gradient สีเดียวกับ CI" ที่อยากได้ตั้งแต่แรก — ทำได้เพราะปลายเข้มถูก clamp ด้วย
 * _mix(base, BLACK, 0.72) เสมอ ไม่ว่า user ใส่สีอะไรมา luminance ปลายนั้นก็ต่ำพอให้
 * contrastText() ตัดสินได้จริง (ต่างจากการเอา base ดิบ ๆ ไปย้อม scrim ซึ่งพังทันทีถ้า base สว่าง)
 */
async function renderDuotone(buf, { quoteText, authorName, accentColor, side = 'left' }) {
  const base = accentColor || ORANGE;
  const dark = _mix(base, BLACK, 0.72);
  const lite = _mix(base, WHITE, 0.62);
  const ink  = contrastText(dark);
  const rgb  = ink === WHITE ? '255,255,255' : '0,0,0';

  const grey = await sharp(buf).greyscale().toBuffer();
  const img  = await loadImage(grey);
  const W = img.width, H = img.height;
  const cv  = createCanvas(W, H);
  const ctx = cv.getContext('2d');

  ctx.drawImage(img, 0, 0, W, H);
  // screen ด้วยสีเข้ม = ยกเงาขึ้นมาติดสี · multiply ด้วยสีอ่อน = ดึงไฮไลต์ลงมาติดสี
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = dark;  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = lite;  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';

  const pad  = Math.round(Math.min(W, H) * 0.075);
  const boxH = Math.round(H * 0.42);
  const boxY = H - pad - boxH;

  const g = ctx.createLinearGradient(0, H, 0, boxY - H * 0.12);
  g.addColorStop(0, _rgbaOf(dark, 1));
  g.addColorStop(0.45, _rgbaOf(dark, 0.88));
  g.addColorStop(1, _rgbaOf(dark, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  await drawQuoteBlock(ctx, {
    x: pad, y: boxY, w: W - pad * 2, h: boxH,
    quoteText, authorName, ink, sub: `rgba(${rgb},0.75)`, align: side === 'right' ? 'right' : 'left',
  });
  return { buffer: await toPng(cv), ext: 'png', vertical: 'bottom', side };
}

/** แถบสีแนวตั้งข้างเดียว — รูปอยู่อีกฝั่ง ไม่มีอะไรทับรูปเลย */
async function renderSideBand(buf, { quoteText, authorName, saturation = 1.0, accentColor, bandRatio = 0.42, side = 'left' }) {
  const base = accentColor || ORANGE;
  const { ink, sub } = panelPalette(base);

  const meta = await sharp(buf).metadata();
  const W = meta.width, H = meta.height;
  const bandW = Math.round(W * bandRatio);
  const imgW  = W - bandW;
  const bandX = side === 'left' ? 0 : imgW;
  const imgX  = side === 'left' ? bandW : 0;

  const work = await sharp(buf).modulate({ saturation })
    .resize(imgW, H, { fit: 'cover', position: 'attention' }).toBuffer();
  const img = await loadImage(work);

  const cv  = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, imgX, 0, imgW, H);
  ctx.fillStyle = base;
  ctx.fillRect(bandX, 0, bandW, H);

  const pad = Math.round(bandW * 0.14);
  await drawQuoteBlock(ctx, {
    x: bandX + pad, y: pad, w: bandW - pad * 2, h: H - pad * 2,
    quoteText, authorName, ink, sub, maxLines: 9, qFactor: 0.155,
  });
  return { buffer: await toPng(cv), ext: 'png', vertical: 'center', side };
}

/** matte — พื้นสีล้วน รูปลอยอยู่ข้างบนแบบมีขอบ คำคมอยู่ใต้รูป */
async function renderMatte(buf, { quoteText, authorName, saturation = 1.0, accentColor, inset = 0.06 }) {
  const base = accentColor || ORANGE;
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
  await drawQuoteBlock(ctx, {
    x: m, y: boxY, w: imgW, h: H - boxY - m,
    quoteText, authorName, ink, sub,
  });
  return { buffer: await toPng(cv), ext: 'png', vertical: 'bottom', side: 'left' };
}

/** '#rrggbb' + alpha → rgba() */
function _rgbaOf(hex, a) { return `rgba(${_rgbTriplet(hex)},${a})`; }

// ── Styles ───────────────────────────────────────────────────────────────────
// โหมด AI: Claude ตัดสิน band (บน/ล่าง) = แถบโล่งคน + align + สี (3 ระดับ) — ล่ม → random
// honor การเลือกสีเองจาก opts.saturation (ถ้าไม่ null = user เลือกเอง)
const SATS = [1.0, 0.55, 0.15];
const SAT_LEVEL = { full: 1.0, mid: 0.55, bw: 0.15 };
async function renderEmberAI(buf, opts) {
  const layout   = await analyzeLayout(buf, opts.mimeType || 'image/jpeg', 'claude');
  const fallback = layout.reasoning === 'fallback defaults';
  // AI ตัดสินแค่ band (บน/ล่าง) = แถบที่โล่งคนสุด + align (ซ้าย/ขวา) = ฝั่งที่ว่าง
  const side     = fallback ? (Math.random() < 0.5 ? 'left' : 'right') : layout.align;
  const vertical = fallback ? (Math.random() < 0.5 ? 'top' : 'bottom') : layout.band;
  // สี: เลือกเอง > AI > random (ตอน fallback)
  const saturation = opts.saturation != null ? opts.saturation
                   : fallback ? SATS[Math.floor(Math.random() * SATS.length)]
                   : SAT_LEVEL[layout.saturationLevel];
  console.log('[ember-ai]', fallback ? 'AI ล่ม→random' : `band=${layout.band} align=${layout.align}`, '→', side, vertical, 'sat', saturation, '|', layout.reasoning);
  return renderVariant(buf, { ...opts, side, vertical, saturation, markScale: 0.7, gradDark: 0.98 });
}

const ember = (side, vertical, extra = {}) => (buf, opts) =>
  renderVariant(buf, { ...opts, side, vertical, markScale: 0.7, gradDark: 0.98, ...extra });

// ── quote-2-center: ข้อความกลางภาพ, BG หรี่ + ดำคลุม 75%, Google Sans (มีหัว) ──
// supersample 2x แล้วย่อ = ขอบคม. ใช้ fitFont/lsDraw ตัวเดียวกับ quote-1
async function renderCenter(buf, { quoteText, authorName, saturation = 1.0 }) {
  const SS = 2, OVERLAY = 0.75;
  const meta = await sharp(buf).metadata();
  const W = meta.width, H = meta.height;

  const work = await sharp(buf).modulate({ saturation }).resize(W * SS, H * SS, { fit: 'cover' }).toBuffer();
  const img  = await loadImage(work);
  const cv   = createCanvas(W * SS, H * SS);
  const ctx  = cv.getContext('2d');
  ctx.scale(SS, SS);

  ctx.drawImage(img, 0, 0, W, H);
  ctx.fillStyle = `rgba(0,0,0,${OVERLAY})`;
  ctx.fillRect(0, 0, W, H);

  const padX = Math.round(W * 0.11);
  const startSz = Math.max(40, Math.round(W * 0.085));
  const { fontSize: qsz, lines } = fitFont(ctx, quoteText, W - padX * 2, startSz, 6, 'GSans');
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
  ctx.font = `bold ${qsz}px GSans`;
  for (const l of lines) {
    const w = lsWidth(ctx, l, 1.0);
    ctx.fillStyle = WHITE;
    lsDraw(ctx, l, (W - w) / 2, ty, 1.0);
    ty += lh;
  }

  // author กลาง
  ty += nsz * 0.6;
  ctx.font = `${nsz}px AnakotmaiLight`; ctx.fillStyle = 'rgba(255,255,255,0.85)';   // author ไม่มีหัวเสมอ
  const aw = lsWidth(ctx, authorName, 0.8);
  lsDraw(ctx, authorName, (W - aw) / 2, ty, 0.8);

  const big = await toPng(cv);
  const out = await sharp(big).resize(W, H).png().toBuffer();   // ย่อ 2x → 1x ขอบคม
  return { buffer: out, ext: 'png', vertical: 'center', side: 'center' };
}

const STYLES = {
  'quote-1-ember-bottom-left':  ember('left',  'bottom', { markExtraGap: 0.65, markScale: 0.84 }),
  'quote-1-ember-bottom-right': ember('right', 'bottom', { markExtraGap: 0.65, markScale: 0.84 }),
  'quote-1-ember-top-left':     ember('left',  'top',   { noMark: true }),
  'quote-1-ember-top-right':    ember('right', 'top',   { noMark: true }),
  'quote-1-pillar-left':        (buf, opts) => renderBorder(buf, opts),
  'quote-1-frame-right':        (buf, opts) => renderBorder2(buf, opts),
  'quote-1-ember-ai':           (buf, opts) => renderEmberAI(buf, opts),
  'quote-2-center':             (buf, opts) => renderCenter(buf, opts),
};
// random pool ไม่รวม ember-ai — สุ่มจะได้ไม่เผลอยิง API
const RANDOM_KEYS = Object.keys(STYLES).filter(k => k !== 'quote-1-ember-ai');
const STYLE_KEYS  = Object.keys(STYLES);

async function renderQuoteStyle(styleKey, sourceBuffer, opts) {
  const key = (!styleKey || styleKey === 'random')
    ? RANDOM_KEYS[Math.floor(Math.random() * RANDOM_KEYS.length)]
    : styleKey;
  const fn = STYLES[key];
  if (!fn) throw new Error(`Unknown style: ${key}`);
  return fn(sourceBuffer, { ...opts, authorName: opts.authorName || '' });
}

function parseStyle(input) {
  const s = (input || '').trim();
  if (!s || s === 'สุ่ม' || s === 'สุม' || s === 'random')
    return RANDOM_KEYS[Math.floor(Math.random() * RANDOM_KEYS.length)];
  const match = STYLE_KEYS.find(k => k.toLowerCase() === s.toLowerCase());
  return match || null;
}

// renderPanel/panelPalette ยัง**ไม่อยู่ใน STYLES** — ยังเป็นตัวอย่างให้ดูก่อนเคาะ
// เคาะเมื่อไหร่ค่อยเติมคีย์ใน STYLES แล้วมันจะตกเข้า random pool เอง
module.exports = {
  renderQuoteStyle, parseStyle, FRAME_RIGHT,
  renderPanel, renderDuotone, renderSideBand, renderMatte, panelPalette,
  renderVariant, _mix,   // export ไว้ทดลอง scrimMix — ยังไม่มีสไตล์ไหนใน STYLES ใช้
};
