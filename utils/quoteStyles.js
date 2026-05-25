// utils/quoteStyles.js — Quote image styles
const sharp  = require('sharp');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path   = require('path');

GlobalFonts.registerFromPath(
  path.join(__dirname, '..', 'assets', 'fonts', 'Anakotmai-Bold.ttf'),
  'Anakotmai'
);
GlobalFonts.registerFromPath(
  path.join(__dirname, '..', 'assets', 'fonts', 'Anakotmai-Light.ttf'),
  'AnakotmaiLight'
);

const QUOTE_DIR = path.join(__dirname, '..', 'assets', 'quote');
const markCache = {};
async function loadMark(name) {
  if (!markCache[name]) markCache[name] = await loadImage(path.join(QUOTE_DIR, `${name}.png`));
  return markCache[name];
}

const ORANGE = '#ff6a13';
const WHITE  = '#ffffff';

// ── Helpers ───────────────────────────────────────────────────────────────────

const _segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });
function graphemes(text) { return [..._segmenter.segment(text)].map(s => s.segment); }

function _wrapGreedy(ctx, text, maxWidth) {
  const lines = [];
  for (const para of text.split('\n')) {
    const words = para.trim().split(' ').filter(Boolean);
    if (!words.length) continue;
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
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

function fitFont(ctx, text, maxWidth, startSz, maxLines = 4) {
  // ถ้า user ใส่ \n เอง — respect ทุกบรรทัด ไม่ wrap เพิ่ม แค่ shrink font ให้ fit
  if (text.includes('\n')) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const minSz = Math.round(startSz * 0.30);
    let sz = startSz;
    while (sz > minSz) {
      ctx.font = `bold ${sz}px Anakotmai`;
      if (lines.every(l => lsWidth(ctx, l) <= maxWidth)) return { fontSize: sz, lines };
      sz = Math.max(minSz, Math.round(sz * 0.9));
    }
    ctx.font = `bold ${minSz}px Anakotmai`;
    return { fontSize: minSz, lines };
  }

  const minSz = Math.round(startSz * 0.65);
  let sz = startSz;
  while (sz > minSz) {
    ctx.font = `bold ${sz}px Anakotmai`;
    const lines = wrapText(ctx, text, maxWidth);
    const allFit = lines.every(l => lsWidth(ctx, l) <= maxWidth);
    if (lines.length <= maxLines && allFit) return { fontSize: sz, lines };
    sz = Math.max(minSz, Math.round(sz * 0.9));
  }
  ctx.font = `bold ${minSz}px Anakotmai`;
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
async function renderVariant(buf, { quoteText, authorName, side = 'left', markScale = 1.0, gradDark = 0.95, saturation = 0.15 }) {
  const isRight = side === 'right';

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
  const { fontSize: qszFit, lines } = fitFont(ctx, quoteText, maxW - barW - barGap - 4, qsz, 4);
  const lh    = qszFit * 1.2;
  const textH = lines.length * lh + nsz * 1.8;

  const textX        = isRight ? W - maxW - pad - barW - barGap - 4 : pad + barW + barGap + 4;
  const barX         = isRight ? W - pad - barW : pad;
  const textBlockTop = H - pad - textH;
  const markY        = textBlockTop - markGap - markH;

  const OPEN_MARKS  = ['double_open', 'classic_open', 'block_open', 'outline_open', 'big_open'];
  const CLOSE_MARKS = ['double_close', 'classic_close', 'block_close', 'outline_close'];
  const pool    = isRight ? CLOSE_MARKS : OPEN_MARKS;
  const markImg = await loadMark(pool[Math.floor(Math.random() * pool.length)]);
  const markW   = (markImg.width / markImg.height) * markH;
  // left: mark ซ้าย align กับ bar edge, right: mark ขวา align กับ text ขวา
  const markX   = isRight ? textX + maxW - markW : pad;

  const gV = ctx.createLinearGradient(0, H, 0, markY - H * 0.2);
  gV.addColorStop(0,   `rgba(0,5,12,${gradDark})`);
  gV.addColorStop(0.4, `rgba(0,5,12,${Math.round(gradDark * 0.84 * 100) / 100})`);
  gV.addColorStop(1,   'rgba(0,5,12,0)');
  ctx.fillStyle = gV;
  ctx.fillRect(0, 0, W, H);

  drawMark(ctx, markImg, markX, markY, markH);

  ctx.fillStyle = ORANGE;
  ctx.fillRect(barX, textBlockTop, barW, textH);

  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
  let ty = textBlockTop;
  for (const l of lines) {
    const drawX = isRight ? textX + (maxW - lsWidth(ctx, l, 1.0)) : textX;
    ctx.fillStyle = WHITE; lsDraw(ctx, l, drawX, ty, 1.0);
    ty += lh;
  }

  ty += nsz * 0.5;
  ctx.font = `${nsz}px AnakotmaiLight`; ctx.fillStyle = ORANGE;
  ctx.shadowBlur = 4; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  if (isRight) {
    const aw = lsWidth(ctx, `— ${authorName}`, 0.8);
    lsDraw(ctx, `— ${authorName}`, textX + (maxW - aw), ty, 0.8);
  } else {
    lsDraw(ctx, `— ${authorName}`, textX, ty, 0.8);
  }

  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  return { buffer: await toPng(cv), ext: 'png' };
}

// ── Style 7: quote_border (mark + H-bar + V-bar เป็นชิ้นเดียว) ───────────────
// PNG 822x714 — V-bar spans y 32%–95%, text area starts at x 24%, y 32%
async function renderBorder(buf, { quoteText, authorName, saturation = 0.15 }) {
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
  const { fontSize: qszFit, lines } = fitFont(ctx, quoteText, maxW7, qsz, 4);
  const lh      = qszFit * 1.2;
  const textH   = lines.length * lh + nsz * 1.8;
  const maxTextW = maxW7;

  // scale PNG 50% — V-bar = 75% of height
  const pngH    = (textH / 0.75) * 0.5;
  const pngW    = pngH * (698 / 591);
  const borderX = Math.round(pad * 0.6);
  const textBlockTop = H - pad - textH;
  const borderY      = textBlockTop - pngH * 0.25;

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
  ctx.drawImage(borderImg, borderX, borderY, pngW, pngH);

  // quote text
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
  let ty = textBlockTop;
  for (const l of lines) {
    ctx.fillStyle = WHITE; lsDraw(ctx, l, textX, ty, 1.0);
    ty += lh;
  }

  ty += nsz * 0.5;
  ctx.font = `${nsz}px AnakotmaiLight`; ctx.fillStyle = ORANGE;
  ctx.shadowBlur = 4; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  lsDraw(ctx, `— ${authorName}`, textX, ty, 0.8);

  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  return { buffer: await toPng(cv), ext: 'png' };
}

// ── Style 8: quote_border_2 (top H + right V + bottom H — right frame) ───────
// PNG 865x400 — C-shape: H-bar top y≈5%, V-bar right x≈97%, H-bar bottom y≈94%
// content area height = 89% of pngH, aspect ratio = 865/400 = 2.1625
async function renderBorder2(buf, { quoteText, authorName, saturation = 0.15 }) {
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

  const maxW8   = W * 0.80;
  const { fontSize: qszFit, lines } = fitFont(ctx, quoteText, maxW8, qsz, 4);
  const lh      = qszFit * 1.2;
  const maxTextW = maxW8;
  const textH = lines.length * lh + nsz * 1.8;

  // scale PNG so content area (89%) = textH
  const pngH    = textH / 0.89;
  const pngW    = pngH * (865 / 400);
  const textBlockTop = H - pad - textH;
  // content top (5%) aligns with textBlockTop, + small internal padding gap
  const innerGap = pngH * 0.075;  // gap between frame line and text
  const borderY  = textBlockTop - pngH * 0.05 - innerGap;
  // right-align: right edge at W - pad
  const borderX = W - pad - pngW;

  // text inside: left of V-bar (97%), right-aligned
  const contentX    = borderX + pngW * 0.02;
  const contentMaxW = pngW * 0.93;
  const authorMaxW  = pngW * 0.75;

  const gV = ctx.createLinearGradient(0, H, 0, borderY - H * 0.2);
  gV.addColorStop(0,   'rgba(0,5,12,0.95)');
  gV.addColorStop(0.4, 'rgba(0,5,12,0.80)');
  gV.addColorStop(1,   'rgba(0,5,12,0)');
  ctx.fillStyle = gV; ctx.fillRect(0, 0, W, H);

  ctx.drawImage(borderImg, borderX, borderY, pngW, pngH);

  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
  let ty = textBlockTop;
  for (const l of lines) {
    const drawX = contentX + (contentMaxW - lsWidth(ctx, l, 1.0));
    ctx.fillStyle = WHITE; lsDraw(ctx, l, drawX, ty, 1.0);
    ty += lh;
  }

  ty += nsz * 0.5;
  ctx.font = `${nsz}px AnakotmaiLight`; ctx.fillStyle = ORANGE;
  ctx.shadowBlur = 4; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  const aw = lsWidth(ctx, `— ${authorName}`, 0.8);
  lsDraw(ctx, `— ${authorName}`, contentX + (authorMaxW - aw), ty, 0.8);

  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  return { buffer: await toPng(cv), ext: 'png' };
}

// ── Styles ───────────────────────────────────────────────────────────────────
const STYLES = {
  'quote-1-ember-left':  (buf, opts) => renderVariant(buf, { ...opts, side: 'left',  markScale: 0.7, gradDark: 0.98 }),
  'quote-1-ember-right': (buf, opts) => renderVariant(buf, { ...opts, side: 'right', markScale: 0.7, gradDark: 0.98 }),
  'quote-1-pillar-left': (buf, opts) => renderBorder(buf, opts),
  'quote-1-frame-right': (buf, opts) => renderBorder2(buf, opts),
};
const STYLE_KEYS = Object.keys(STYLES);

async function renderQuoteStyle(styleKey, sourceBuffer, opts) {
  const fn = STYLES[styleKey];
  if (!fn) throw new Error(`Unknown style: ${styleKey}`);
  return fn(sourceBuffer, { ...opts, authorName: opts.authorName || '' });
}

function parseStyle(input) {
  const s = (input || '').trim();
  if (!s || s === 'สุ่ม' || s === 'สุม' || s === 'random')
    return STYLE_KEYS[Math.floor(Math.random() * STYLE_KEYS.length)];
  const match = STYLE_KEYS.find(k => k.toLowerCase() === s.toLowerCase());
  return match || null;
}

module.exports = { renderQuoteStyle, parseStyle };
