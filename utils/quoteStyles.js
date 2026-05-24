// utils/quoteStyles.js — 6 quote image styles
const sharp  = require('sharp');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path   = require('path');

GlobalFonts.registerFromPath(
  path.join(__dirname, '..', 'assets', 'fonts', 'Kanit-Bold.ttf'),
  'Kanit'
);

const ORANGE = '#ff6a13';
const NAVY   = '#002b49';
const WHITE  = '#ffffff';

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapText(ctx, text, maxWidth) {
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

function lsDraw(ctx, text, x, y, sp = 1.5) {
  let cx = x;
  for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + sp; }
  return cx - x;
}

function lsWidth(ctx, text, sp = 1.5) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + sp;
  return w;
}

// Custom round quotation mark (two circles + tails)
function drawMark(ctx, x, y, size, color) {
  const r = size * 0.28, gap = size * 0.62;
  ctx.save();
  ctx.fillStyle = ctx.strokeStyle = color;
  ctx.shadowBlur = 0;
  for (let i = 0; i < 2; i++) {
    const cx = x + i * gap;
    ctx.beginPath(); ctx.arc(cx, y + r, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.3, y + r * 1.6);
    ctx.quadraticCurveTo(cx + r * 1.0, y + r * 2.5, cx - r * 0.2, y + r * 3.3);
    ctx.lineWidth = r * 0.9; ctx.lineCap = 'round'; ctx.stroke();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

async function toJpeg(canvas) {
  return sharp(canvas.toBuffer('image/png')).jpeg({ quality: 93 }).toBuffer();
}

// ── Style 1: Modern & Impact — bottom-left + orange trim ─────────────────────
async function style1(buf, { quoteText, authorName }) {
  const work = await sharp(buf).modulate({ saturation: 0.25 }).toBuffer();
  const img  = await loadImage(work);
  const W = img.width, H = img.height;
  const cv = createCanvas(W, H), ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);

  const pad  = Math.round(Math.min(W, H) * 0.055);
  const barW = Math.max(4, Math.round(W * 0.006));
  const maxW = W * 0.44;
  const qsz  = Math.max(26, Math.round(W * 0.04));
  const nsz  = Math.max(14, Math.round(W * 0.025));
  const msz  = Math.max(20, Math.round(W * 0.032));
  const lh   = qsz * 1.18;

  ctx.font = `bold ${qsz}px Kanit`;
  const lines = wrapText(ctx, quoteText, maxW - barW - 14);
  const totH  = msz * 0.5 + lines.length * lh + nsz * 2.2;

  // gradient bottom-left
  const gw = maxW + pad * 3.2, gh = totH + pad * 3.5;
  const g = ctx.createLinearGradient(0, H - gh, gw, H);
  g.addColorStop(0, 'rgba(0,8,18,0.86)'); g.addColorStop(0.65, 'rgba(0,8,18,0.7)'); g.addColorStop(1, 'rgba(0,8,18,0)');
  ctx.fillStyle = g; ctx.fillRect(0, H - gh, gw, gh);

  const bx = pad + barW + 14;
  const by = H - totH - pad;

  ctx.fillStyle = ORANGE; ctx.fillRect(pad, by, barW, totH);
  drawMark(ctx, bx + maxW - msz * 1.3, by, msz, ORANGE);

  ctx.textBaseline = 'top'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6;
  ctx.font = `bold ${qsz}px Kanit`; ctx.fillStyle = WHITE;
  let ty = by;
  for (const l of lines) { lsDraw(ctx, l, bx, ty, 1.5); ty += lh; }

  ty += nsz * 0.4;
  ctx.font = `${nsz}px Kanit`; ctx.fillStyle = ORANGE; ctx.shadowBlur = 3;
  lsDraw(ctx, `— ${authorName}`, bx, ty, 0.8);

  return { buffer: await toJpeg(cv), ext: 'jpg' };
}

// ── Style 2: Sophisticated Overlay — orange tint + white box bottom-right ─────
async function style2(buf, { quoteText, authorName }) {
  const img = await loadImage(buf);
  const W = img.width, H = img.height;
  const cv = createCanvas(W, H), ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);

  ctx.fillStyle = 'rgba(255,106,19,0.20)'; ctx.fillRect(0, 0, W, H);

  const pad  = Math.round(Math.min(W, H) * 0.055);
  const maxW = W * 0.41;
  const qsz  = Math.max(24, Math.round(W * 0.037));
  const nsz  = Math.max(13, Math.round(W * 0.023));
  const msz  = Math.max(18, Math.round(W * 0.03));
  const lh   = qsz * 1.18;
  const bp   = Math.round(Math.min(W, H) * 0.03);

  ctx.font = `bold ${qsz}px Kanit`;
  const lines = wrapText(ctx, quoteText, maxW);
  const textH = msz * 3.6 + lines.length * lh + nsz * 2.2;
  const bw = maxW + bp * 2, bh = textH + bp * 2;
  const bx = W - bw - pad, by = H - bh - pad;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 4;
  ctx.fillStyle = 'rgba(255,255,255,0.93)';
  roundRect(ctx, bx, by, bw, bh, 12); ctx.fill();
  ctx.restore();

  const tx = bx + bp; let ty = by + bp;
  ctx.shadowBlur = 0;
  drawMark(ctx, tx, ty, msz, ORANGE);

  ty += msz * 3.6;
  ctx.font = `bold ${qsz}px Kanit`; ctx.fillStyle = NAVY; ctx.textBaseline = 'top';
  for (const l of lines) { lsDraw(ctx, l, tx, ty, 1.5); ty += lh; }

  ty += nsz * 0.4;
  ctx.font = `${nsz}px Kanit`; ctx.fillStyle = ORANGE;
  lsDraw(ctx, `— ${authorName}`, tx, ty, 0.8);

  return { buffer: await toJpeg(cv), ext: 'jpg' };
}

// ── Style 3: Editorial Focus — vignette + quote mark centered (AI placement) ──
async function style3(buf, { quoteText, authorName, layout = {} }) {
  const img = await loadImage(buf);
  const W = img.width, H = img.height;
  const cv = createCanvas(W, H), ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);

  const pos     = (layout.quotePosition || 'center-left');
  const isRight = pos.includes('right');
  const pad  = Math.round(Math.min(W, H) * 0.055);
  const maxW = W * 0.44;
  const qsz  = Math.max(26, Math.round(W * 0.042));
  const nsz  = Math.max(14, Math.round(W * 0.025));
  const msz  = Math.max(28, Math.round(W * 0.048));
  const lh   = qsz * 1.18;

  ctx.font = `bold ${qsz}px Kanit`;
  const lines = wrapText(ctx, quoteText, maxW);
  const totH  = msz * 3.6 + lines.length * lh + nsz * 2.5;

  // radial vignette from bottom corner
  const vigX = isRight ? W : 0;
  const vg = ctx.createRadialGradient(vigX, H, Math.max(W, H) * 0.05, vigX, H, Math.max(W, H) * 0.9);
  vg.addColorStop(0, 'rgba(0,12,25,0.80)'); vg.addColorStop(0.5, 'rgba(0,12,25,0.45)'); vg.addColorStop(1, 'rgba(0,12,25,0)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  const bx = isRight ? W - maxW - pad : pad;
  const by = H - totH - pad;

  drawMark(ctx, bx + (maxW - msz * 1.2) / 2, by, msz, ORANGE);

  ctx.textBaseline = 'top'; ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 7;
  ctx.font = `bold ${qsz}px Kanit`; ctx.fillStyle = layout.textColor || WHITE;
  let ty = by + msz * 3.6;
  for (const l of lines) { lsDraw(ctx, l, bx, ty, 1.5); ty += lh; }

  ty += nsz * 0.4;
  ctx.font = `${nsz}px Kanit`; ctx.fillStyle = ORANGE; ctx.shadowBlur = 3;
  lsDraw(ctx, `— ${authorName}`, bx, ty, 0.8);

  return { buffer: await toJpeg(cv), ext: 'jpg' };
}

// ── Style 4: Bold Clean — dim bottom-right, floating text, no box ─────────────
async function style4(buf, { quoteText, authorName }) {
  const img = await loadImage(buf);
  const W = img.width, H = img.height;
  const cv = createCanvas(W, H), ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);

  const pad  = Math.round(Math.min(W, H) * 0.055);
  const maxW = W * 0.44;
  const qsz  = Math.max(28, Math.round(W * 0.046));
  const nsz  = Math.max(14, Math.round(W * 0.025));
  const lh   = qsz * 1.18;

  ctx.font = `bold ${qsz}px Kanit`;
  const lines = wrapText(ctx, quoteText, maxW);
  const totH  = lines.length * lh + nsz * 2.8;

  // radial dim bottom-right
  const gr = Math.max(maxW, totH) * 1.5;
  const g = ctx.createRadialGradient(W, H, gr * 0.05, W, H, gr * 1.15);
  g.addColorStop(0, 'rgba(0,8,18,0.84)'); g.addColorStop(0.55, 'rgba(0,8,18,0.62)'); g.addColorStop(1, 'rgba(0,8,18,0)');
  ctx.fillStyle = g; ctx.fillRect(W - maxW - pad * 3, H - totH - pad * 3, maxW + pad * 3, totH + pad * 3);

  const bx = W - maxW - pad;
  const by = H - totH - pad;

  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
  ctx.font = `bold ${qsz}px Kanit`; ctx.fillStyle = WHITE;
  let ty = by;
  for (const l of lines) { lsDraw(ctx, l, bx, ty, 1.8); ty += lh; }

  ty += nsz * 0.5;
  ctx.font = `${nsz}px Kanit`; ctx.fillStyle = ORANGE;
  ctx.shadowBlur = 4; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  lsDraw(ctx, `— ${authorName}`, bx, ty, 0.8);

  return { buffer: await toJpeg(cv), ext: 'jpg' };
}

// ── Style 5: Elegant Frame — white glassmorphism box bottom-right ─────────────
async function style5(buf, { quoteText, authorName }) {
  const img = await loadImage(buf);
  const W = img.width, H = img.height;
  const cv = createCanvas(W, H), ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);

  ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(0, 0, W, H);

  const pad  = Math.round(Math.min(W, H) * 0.05);
  const maxW = W * 0.40;
  const qsz  = Math.max(22, Math.round(W * 0.035));
  const nsz  = Math.max(13, Math.round(W * 0.022));
  const msz  = Math.max(16, Math.round(W * 0.026));
  const lh   = qsz * 1.18;
  const bp   = Math.round(Math.min(W, H) * 0.032);

  ctx.font = `bold ${qsz}px Kanit`;
  const lines = wrapText(ctx, quoteText, maxW);
  const textH = msz * 3.4 + lines.length * lh + nsz * 2.2;
  const bw = maxW + bp * 2, bh = textH + bp * 2;
  const bx = W - bw - pad, by = H - bh - pad;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6;
  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  roundRect(ctx, bx, by, bw, bh, 14); ctx.fill();
  ctx.restore();

  // orange top accent bar
  ctx.fillStyle = ORANGE;
  ctx.fillRect(bx, by, bw, Math.max(3, Math.round(H * 0.004)));

  const tx = bx + bp; let ty = by + bp;
  ctx.shadowBlur = 0;
  drawMark(ctx, tx, ty, msz, ORANGE);

  ty += msz * 3.4;
  ctx.font = `bold ${qsz}px Kanit`; ctx.fillStyle = '#1a1a1a'; ctx.textBaseline = 'top';
  for (const l of lines) { lsDraw(ctx, l, tx, ty, 1.5); ty += lh; }

  ty += nsz * 0.4;
  ctx.font = `${nsz}px Kanit`; ctx.fillStyle = ORANGE;
  lsDraw(ctx, `— ${authorName}`, tx, ty, 0.8);

  return { buffer: await toJpeg(cv), ext: 'jpg' };
}

// ── Style 6: Orange Accent right — bottom-right + right-aligned ──────────────
async function style6(buf, { quoteText, authorName }) {
  const work = await sharp(buf).modulate({ saturation: 0.25 }).toBuffer();
  const img  = await loadImage(work);
  const W = img.width, H = img.height;
  const cv = createCanvas(W, H), ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);

  const pad  = Math.round(Math.min(W, H) * 0.055);
  const barW = Math.max(4, Math.round(W * 0.006));
  const maxW = W * 0.44;
  const qsz  = Math.max(26, Math.round(W * 0.04));
  const nsz  = Math.max(14, Math.round(W * 0.025));
  const msz  = Math.max(20, Math.round(W * 0.032));
  const lh   = qsz * 1.18;

  ctx.font = `bold ${qsz}px Kanit`;
  const lines = wrapText(ctx, quoteText, maxW - barW - 14);
  const totH  = msz * 0.5 + lines.length * lh + nsz * 2.2;

  // gradient bottom-right
  const gw = maxW + pad * 3.5, gh = totH + pad * 3.5;
  const g = ctx.createLinearGradient(W, H - gh, W - gw, H);
  g.addColorStop(0, 'rgba(0,8,18,0.86)'); g.addColorStop(0.65, 'rgba(0,8,18,0.7)'); g.addColorStop(1, 'rgba(0,8,18,0)');
  ctx.fillStyle = g; ctx.fillRect(W - gw, H - gh, gw, gh);

  const barX = W - pad - barW;
  const bx   = barX - maxW - 14;
  const by   = H - totH - pad;

  ctx.fillStyle = ORANGE; ctx.fillRect(barX, by, barW, totH);
  drawMark(ctx, bx, by, msz, ORANGE);

  ctx.textBaseline = 'top'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6;
  ctx.font = `bold ${qsz}px Kanit`; ctx.fillStyle = WHITE;
  let ty = by;
  for (const l of lines) {
    const lw = lsWidth(ctx, l, 1.5);
    lsDraw(ctx, l, bx + (maxW - lw), ty, 1.5);
    ty += lh;
  }

  ty += nsz * 0.4;
  ctx.font = `${nsz}px Kanit`; ctx.fillStyle = ORANGE; ctx.shadowBlur = 3;
  const at = `${authorName} —`;
  lsDraw(ctx, at, bx + (maxW - lsWidth(ctx, at, 0.8)), ty, 0.8);

  return { buffer: await toJpeg(cv), ext: 'jpg' };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
const STYLES = { 1: style1, 2: style2, 3: style3, 4: style4, 5: style5, 6: style6 };

async function renderQuoteStyle(styleNum, sourceBuffer, opts) {
  const fn = STYLES[styleNum];
  if (!fn) throw new Error(`Unknown style: ${styleNum}`);
  return fn(sourceBuffer, opts);
}

module.exports = { renderQuoteStyle };
