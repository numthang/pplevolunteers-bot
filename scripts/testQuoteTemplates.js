// scripts/testQuoteTemplates.js
// Usage: node scripts/testQuoteTemplates.js <image-path>
// Generates: *_A.jpg (gradient) and *_C.jpg (split)
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

GlobalFonts.registerFromPath(
  path.join(__dirname, '..', 'assets', 'fonts', 'Kanit-Bold.ttf'),
  'Kanit'
);

const imgPath = process.argv[2];
if (!imgPath || !fs.existsSync(imgPath)) {
  console.error('Usage: node scripts/testQuoteTemplates.js <image-path>');
  process.exit(1);
}

const QUOTE  = 'ผมยกเลิก LINE Subscription\nหมดเลยหันมาใช้ Discord';
const AUTHOR = 'นรพนธ์ พลายศรีนิล\nคณะทำงานพรรคประชาชนราชบุรี เขต 1';
const ORANGE = '#ff6a13';
const NAVY   = '#002b49';

// วาด quotation mark แบบ custom circle (หัวกลม)
function drawQuoteMark(ctx, x, y, size, color) {
  const r    = size * 0.28;
  const gap  = size * 0.55;
  ctx.fillStyle = color;
  ctx.shadowBlur = 0;
  for (let i = 0; i < 2; i++) {
    const cx = x + i * gap;
    // วงกลม (หัว)
    ctx.beginPath();
    ctx.arc(cx, y + r, r, 0, Math.PI * 2);
    ctx.fill();
    // หาง
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.5, y + r * 1.6);
    ctx.quadraticCurveTo(cx + r * 1.1, y + r * 2.4, cx - r * 0.2, y + r * 3.4);
    ctx.lineWidth = r * 0.9;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(' ');
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function drawLetterSpaced(ctx, text, x, y, spacing = 2) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return cx - x;
}

// ── Template A: gradient overlay ──────────────────────────────────────────────
async function renderA(sourceBuffer) {
  const srcImg = await loadImage(sourceBuffer);
  const W = srcImg.width;
  const H = srcImg.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(srcImg, 0, 0, W, H);

  // gradient ด้านซ้าย 60% ของรูป จาก navy → transparent
  const gw = W * 0.62;
  const grad = ctx.createLinearGradient(0, 0, gw, 0);
  grad.addColorStop(0,    'rgba(0,20,40,0.88)');
  grad.addColorStop(0.65, 'rgba(0,20,40,0.72)');
  grad.addColorStop(1,    'rgba(0,20,40,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, gw, H);

  const pad       = Math.round(Math.min(W, H) * 0.06);
  const maxWidth  = W * 0.46;
  const quoteSz   = Math.max(28, Math.round(W * 0.044));
  const nameSz    = Math.max(16, Math.round(W * 0.028));
  const markSz    = Math.max(28, Math.round(W * 0.045));
  const lineH     = quoteSz * 1.18;

  ctx.font = `bold ${quoteSz}px Kanit`;
  const lines = wrapText(ctx, QUOTE, maxWidth);
  const totalH = markSz * 3.5 + lines.length * lineH + nameSz * 3;
  const startY = (H - totalH) / 2;

  // quote mark
  drawQuoteMark(ctx, pad, startY, markSz, ORANGE);

  // quote lines
  let ty = startY + markSz * 3.6;
  ctx.font = `bold ${quoteSz}px Kanit`;
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 6;
  ctx.textBaseline = 'top';
  for (const line of lines) {
    drawLetterSpaced(ctx, line, pad, ty, 1.5);
    ty += lineH;
  }

  // author
  ty += nameSz * 0.4;
  ctx.font = `${nameSz}px Kanit`;
  ctx.fillStyle = ORANGE;
  ctx.shadowBlur = 3;
  for (const line of AUTHOR.split('\n')) {
    drawLetterSpaced(ctx, `— ${line}`, pad, ty, 0.8);
    ty += nameSz * 1.5;
  }

  ctx.globalAlpha = 1;
  const { format } = await sharp(sourceBuffer).metadata();
  const buf = await sharp(canvas.toBuffer('image/png'))
    .jpeg({ quality: 93 }).toBuffer();
  return buf;
}

// ── Template C: split ─────────────────────────────────────────────────────────
async function renderC(sourceBuffer) {
  const srcImg = await loadImage(sourceBuffer);
  const W = srcImg.width;
  const H = srcImg.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(srcImg, 0, 0, W, H);

  // ซีกซ้าย navy solid
  const splitX = W * 0.48;
  ctx.fillStyle = NAVY;
  ctx.globalAlpha = 0.92;
  ctx.fillRect(0, 0, splitX, H);
  ctx.globalAlpha = 1;

  // เส้นขอบ orange บาง
  ctx.fillStyle = ORANGE;
  ctx.fillRect(splitX - 3, 0, 3, H);

  const pad      = Math.round(Math.min(W, H) * 0.06);
  const maxWidth = splitX - pad * 2;
  const quoteSz  = Math.max(26, Math.round(W * 0.038));
  const nameSz   = Math.max(15, Math.round(W * 0.026));
  const markSz   = Math.max(24, Math.round(W * 0.038));
  const lineH    = quoteSz * 1.18;

  ctx.font = `bold ${quoteSz}px Kanit`;
  const lines  = wrapText(ctx, QUOTE, maxWidth);
  const totalH = markSz * 3.5 + lines.length * lineH + nameSz * 3.5;
  const startY = (H - totalH) / 2;

  // quote mark
  drawQuoteMark(ctx, pad, startY, markSz, ORANGE);

  // quote lines
  let ty = startY + markSz * 3.6;
  ctx.font = `bold ${quoteSz}px Kanit`;
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 4;
  ctx.textBaseline = 'top';
  for (const line of lines) {
    drawLetterSpaced(ctx, line, pad, ty, 1.5);
    ty += lineH;
  }

  // author
  ty += nameSz * 0.4;
  ctx.font = `${nameSz}px Kanit`;
  ctx.fillStyle = ORANGE;
  ctx.shadowBlur = 2;
  for (const line of AUTHOR.split('\n')) {
    drawLetterSpaced(ctx, `— ${line}`, pad, ty, 0.8);
    ty += nameSz * 1.5;
  }

  ctx.globalAlpha = 1;
  const buf = await sharp(canvas.toBuffer('image/png'))
    .jpeg({ quality: 93 }).toBuffer();
  return buf;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const src = fs.readFileSync(imgPath);
  const base = imgPath.replace(/\.[^.]+$/, '');

  console.log('🎨 Rendering Template A (gradient)...');
  const bufA = await renderA(src);
  fs.writeFileSync(`${base}_A.jpg`, bufA);
  console.log(`   ✅ ${base}_A.jpg`);

  console.log('🎨 Rendering Template C (split)...');
  const bufC = await renderC(src);
  fs.writeFileSync(`${base}_C.jpg`, bufC);
  console.log(`   ✅ ${base}_C.jpg`);

  console.log('\nเปิดดูทั้ง 2 ไฟล์แล้วบอกว่าชอบแบบไหนครับ');
})().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
