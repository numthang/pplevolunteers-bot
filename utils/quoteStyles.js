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
function readableOnDark(hex, min = 6.2) {
  const bg = 0.008;                                  // ≈ พื้นดำ 0.95 ที่ก้นภาพ
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
async function renderVariant(buf, { quoteText, authorName, side = 'left', vertical = 'bottom', markScale = 1.0, gradDark = 0.95, saturation = 0.15, fontBold = 'GSans', fontLight = 'AnakotmaiLight', accentColor, markExtraGap = 0, markAfterText = false, noMark = false }) {
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

  // gradient
  const gV = isTop
    ? ctx.createLinearGradient(0, 0, 0, (textBlockTop + textH) + H * 0.2)
    : ctx.createLinearGradient(0, H, 0, markY - H * 0.2);
  gV.addColorStop(0,   `rgba(0,5,12,${gradDark})`);
  gV.addColorStop(0.4, `rgba(0,5,12,${Math.round(gradDark * 0.84 * 100) / 100})`);
  gV.addColorStop(1,   'rgba(0,5,12,0)');
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

  const gV = ctx.createLinearGradient(0, H, 0, borderY - H * 0.2);
  gV.addColorStop(0,   'rgba(0,5,12,0.95)');
  gV.addColorStop(0.4, 'rgba(0,5,12,0.80)');
  gV.addColorStop(1,   'rgba(0,5,12,0)');
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
  ctx.font = `${nsz}px AnakotmaiLight`; ctx.fillStyle = readableOnDark(accent);
  ctx.shadowBlur = 4; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  lsDraw(ctx, `— ${authorName}`, textX, ty, 0.8);

  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  return { buffer: await toPng(cv), ext: 'png', vertical: 'bottom', side: 'left' };
}

// ── Style 8: quote_border_2 (top H + right V + bottom H — right frame) ───────
// ⚠️ **วัดจากไฟล์ตอน runtime ห้าม hardcode** — ค่าคงที่ที่เขียนมือพังมาแล้ว 2 รอบ:
// คอมเมนต์เดิมบอก 865x400/แถบ 5%–94% แต่ของจริงตอนนั้นคือ 865x391/3.6%–96.4%
// แล้ววันเดียวกันไฟล์ก็ถูกเปลี่ยนเป็น 865x300 → สัดส่วนที่ hardcode ไว้ผิดอีกทันที
// (2026-08-06) · ทีมสื่อเปลี่ยนไฟล์กรอบเมื่อไหร่ก็ได้ โค้ดต้องปรับตามเอง
const frameCache = {};
function frameMetrics(name, img) {
  if (frameCache[name]) return frameCache[name];
  const W = img.width, H = img.height;
  const cv = createCanvas(W, H);
  const c  = cv.getContext('2d');
  c.drawImage(img, 0, 0);
  const { data } = c.getImageData(0, 0, W, H);

  // แถวที่มี pixel ทึบเกิน 5% ของความกว้าง = "แถบนอน" (เส้นตั้งด้านขวาบางกว่านั้น จึงไม่ติด)
  const solid = [];
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 128) n++;
    solid.push(n > W * 0.05);
  }
  let topEnd = solid.indexOf(true);
  if (topEnd < 0) topEnd = 0;
  while (topEnd + 1 < H && solid[topEnd + 1]) topEnd++;
  let botStart = solid.lastIndexOf(true);
  if (botStart < 0) botStart = H - 1;
  while (botStart - 1 >= 0 && solid[botStart - 1]) botStart--;

  const m = { ratio: W / H, top: (topEnd + 1) / H, bottom: botStart / H };
  m.inner = Math.max(0.5, m.bottom - m.top);   // กันไฟล์แปลกๆ ที่วัดแล้วได้ค่าเพี้ยน
  frameCache[name] = m;
  return m;
}
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

  const borderImg = await loadMark('frame_right');
  const FR = frameMetrics('frame_right', borderImg);

  const maxW8   = W * 0.80;
  const { fontSize: qszFit, lines } = fitFont(ctx, quoteText, maxW8, qsz, 4, 'GSans');
  const lh      = qszFit * 1.2;
  const maxTextW = maxW8;
  // nsz * 2.6 = ช่องก่อนชื่อผู้พูด (1.4) + ความสูงบรรทัดชื่อเอง (~1.0) + หางล่าง
  const textH = lines.length * lh + nsz * 2.6;

  // ช่องว่างในกรอบ — **บนมากกว่าล่าง** โดยตั้งใจ:
  // บรรทัดบนเป็นตัวหนาเต็มความสูง + สระบน/วรรณยุกต์ไทยยื่นขึ้นไปอีก เลยดูชิดเส้นง่ายกว่า
  // ส่วนล่างเป็นบรรทัดชื่อผู้พูดตัวเล็ก จึงเหลือช่องน้อยกว่าได้โดยไม่ดูอึดอัด
  // (ตัวเลขนี้ปรับตามตาคน: 0.32 = ชิดไป · 0.45 เท่ากันบนล่าง = ล่างโหว่)
  const padTop    = Math.round(qszFit * 0.85);
  const padBottom = Math.round(qszFit * 0.38);
  const contentH  = textH + padTop + padBottom;

  // ย่อ/ขยาย PNG ให้ **ช่องว่างระหว่างแถบบน-ล่าง (92.8%)** พอดีกับ contentH
  const pngH    = contentH / FR.inner;
  // กรอบต้องไม่กว้างเกินภาพ — คำพูด 5 บรรทัดดันกรอบจนขอบซ้ายหลุดออกนอกเฟรม
  // บีบเฉพาะแนวนอน (ความสูงเท่าเดิม = ข้อความยังอยู่ในกรอบครบ) มุมโค้งเพี้ยนแค่นิดเดียว
  const pngW    = Math.min(pngH * FR.ratio, W - pad * 2);
  // ขอบล่างของกรอบชิดขอบล่างของภาพ (เว้น pad) แล้วค่อยวางข้อความลงในกรอบ
  const borderY = H - pad - pngH;
  const borderX = W - pad - pngW;
  const textBlockTop = borderY + pngH * FR.top + padTop;

  // text inside: left of V-bar (97%), right-aligned
  const contentX    = borderX + pngW * 0.02;
  const contentMaxW = pngW * 0.93;
  const authorMaxW  = pngW * 0.75;

  const gV = ctx.createLinearGradient(0, H, 0, borderY - H * 0.2);
  gV.addColorStop(0,   'rgba(0,5,12,0.95)');
  gV.addColorStop(0.4, 'rgba(0,5,12,0.80)');
  gV.addColorStop(1,   'rgba(0,5,12,0)');
  ctx.fillStyle = gV; ctx.fillRect(0, 0, W, H);

  // ⚠️ กรอบเป็น PNG สีส้ม CI ที่ baked มาแล้ว — ต้องย้อมตาม accent เหมือน mark ของสไตล์ ember
  //    ไม่ย้อม = ตั้งสี CI เองแล้วมีผลแค่ตัวหนังสือ กรอบยังส้มอยู่ (เจอ 2026-08-06)
  drawTinted(ctx, borderImg, borderX, borderY, pngW, pngH, accent);

  ctx.textBaseline = 'top';
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.font = `bold ${qszFit}px GSans`;
  let ty = textBlockTop;
  for (const l of lines) {
    const drawX = contentX + (contentMaxW - lsWidth(ctx, l, 1.0));
    ctx.fillStyle = WHITE; lsDraw(ctx, l, drawX, ty, 1.0);
    ty += lh;
  }

  ty += nsz * 1.4;                    // ดันชื่อผู้พูดลงห่างจากบล็อกคำคม
  ctx.font = `${nsz}px AnakotmaiLight`;
  // สี accent เข้มๆ จมหายไปกับ gradient ดำก้นภาพ → ใช้เวอร์ชันที่อ่านออก (กรอบยังสีจริง)
  ctx.fillStyle = readableOnDark(accent);
  // ⚠️ shadowBlur อย่างเดียวไม่มีผล — canvas default shadowColor เป็นดำโปร่งใส 100%
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 6; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 1;
  const aw = lsWidth(ctx, `— ${authorName}`, 0.8);
  lsDraw(ctx, `— ${authorName}`, contentX + (authorMaxW - aw), ty, 0.8);

  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  return { buffer: await toPng(cv), ext: 'png', vertical: 'bottom', side: 'right' };
}

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

module.exports = { renderQuoteStyle, parseStyle };
