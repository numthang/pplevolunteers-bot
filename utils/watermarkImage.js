// utils/watermarkImage.js
const sharp = require('sharp');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const https = require('https');
const http = require('http');
const path = require('path');

GlobalFonts.registerFromPath(
  path.join(__dirname, '..', 'assets', 'fonts', 'Kanit-Bold.ttf'),
  'Kanit'
);

async function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function calcPos(imgW, imgH, wmW, wmH, position) {
  const pad = Math.max(10, Math.round(Math.min(imgW, imgH) * 0.025));
  if (position === 'random') {
    const corners = [
      { x: pad,              y: pad },
      { x: imgW - wmW - pad, y: pad },
      { x: pad,              y: imgH - wmH - pad },
      { x: imgW - wmW - pad, y: imgH - wmH - pad },
    ];
    return corners[Math.floor(Math.random() * 4)];
  }
  switch (position) {
    case 'bottom-left': return { x: pad,              y: imgH - wmH - pad };
    case 'center':      return { x: (imgW - wmW) / 2, y: (imgH - wmH) / 2 };
    case 'top-right':   return { x: imgW - wmW - pad, y: pad };
    default:            return { x: imgW - wmW - pad, y: imgH - wmH - pad }; // bottom-right
  }
}

// ── Image watermark (sharp — Lanczos3) ────────────────────────────────────────
async function applyImageWatermark(sourceBuffer, { imagePath, position, opacity, size = 0.13 }) {
  const { width: W, height: H } = await sharp(sourceBuffer).metadata();

  const wmW = Math.round(Math.max(W, H) * size);

  // scale ด้วย Lanczos3 แล้ว multiply alpha ตาม opacity
  const wmResized = await sharp(imagePath)
    .resize(wmW, null, { kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .toBuffer();

  const { data, info } = await sharp(wmResized).raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) {
    data[i] = Math.round(data[i] * opacity);
  }
  const wmFinal = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png().toBuffer();

  const wmMeta = await sharp(wmFinal).metadata();
  const { x, y } = calcPos(W, H, wmMeta.width, wmMeta.height, position);

  const { format } = await sharp(sourceBuffer).metadata();
  const out = sharp(sourceBuffer).composite([{ input: wmFinal, left: Math.round(x), top: Math.round(y) }]);
  const buf = await (format === 'png' ? out.png() : out.jpeg({ quality: 92 })).toBuffer();
  return { buffer: buf, ext: format === 'png' ? 'png' : 'jpg' };
}

// ── Text watermark (canvas — Thai font support) ───────────────────────────────
async function applyTextWatermark(sourceBuffer, { text, position, opacity }) {
  const srcImg = await loadImage(sourceBuffer);
  const W = srcImg.width;
  const H = srcImg.height;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(srcImg, 0, 0, W, H);

  const fontSize = Math.max(16, Math.round(W * 0.04));
  ctx.globalAlpha = opacity;
  ctx.font = `bold ${fontSize}px "Kanit", sans-serif`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  const metrics = ctx.measureText(text);
  const { x, y } = calcPos(W, H, metrics.width, fontSize * 1.3, position);
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;

  const canvasBuf = canvas.toBuffer('image/png');
  const { format } = await sharp(sourceBuffer).metadata();
  const out = sharp(canvasBuf);
  const buf = await (format === 'png' ? out.png() : out.jpeg({ quality: 92 })).toBuffer();
  return { buffer: buf, ext: format === 'png' ? 'png' : 'jpg' };
}

// ── Public API ─────────────────────────────────────────────────────────────────
async function applyWatermark(sourceBuffer, { text, imagePath, position, opacity, size = 0.13 }) {
  if (imagePath) {
    return applyImageWatermark(sourceBuffer, { imagePath, position, opacity, size });
  }
  return applyTextWatermark(sourceBuffer, { text, position, opacity });
}

async function autoEnhance(buffer) {
  return sharp(buffer)
    .linear(1.0, 30)                  // exposure lift +30
    .modulate({ saturation: 1.2 })
    .sharpen({ sigma: 0.6 })
    .toBuffer();
}

// ── Quote overlay (AI-positioned) ─────────────────────────────────────────────
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
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
  return lines.length ? lines : [text];
}

async function applyQuoteOverlay(sourceBuffer, { quoteText, authorName, layout }) {
  let workBuf = sourceBuffer;
  if (layout.applyBW) {
    workBuf = await sharp(workBuf).grayscale().toColourspace('srgb').toBuffer();
  }

  const srcImg = await loadImage(workBuf);
  const W = srcImg.width;
  const H = srcImg.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(srcImg, 0, 0, W, H);

  const pad          = Math.max(24, Math.round(Math.min(W, H) * 0.045));
  const quoteFontSz  = Math.max(28, Math.round(W * 0.048));
  const bigMarkSz    = Math.max(90, Math.round(W * 0.13));
  const nameFontSz   = Math.max(18, Math.round(W * 0.032));
  const maxWidth     = W * 0.46;
  const lineH        = quoteFontSz * 1.55;

  ctx.font = `bold ${quoteFontSz}px Kanit`;
  const lines      = wrapText(ctx, quoteText, maxWidth);
  const textBlockH = bigMarkSz * 0.65 + lines.length * lineH;

  // Determine block position
  const pos = layout.quotePosition || 'center-left';
  let bx = pos.includes('right') ? W - maxWidth - pad : pad;
  let by;
  if (pos.startsWith('top'))         by = pad;
  else if (pos.startsWith('center')) by = Math.max(pad, (H - textBlockH) / 2);
  else                               by = H - textBlockH - pad * 4;

  // Semi-transparent background strip behind quote block
  const bgPadX = pad * 0.6;
  const bgPadY = pad * 0.5;
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle   = '#000000';
  ctx.beginPath();
  const rx = bx - bgPadX;
  const ry = by - bgPadY;
  const rw = maxWidth + bgPadX * 2;
  const rh = textBlockH + bgPadY * 2;
  const r  = 12;
  ctx.moveTo(rx + r, ry);
  ctx.lineTo(rx + rw - r, ry);
  ctx.arcTo(rx + rw, ry, rx + rw, ry + r, r);
  ctx.lineTo(rx + rw, ry + rh - r);
  ctx.arcTo(rx + rw, ry + rh, rx + rw - r, ry + rh, r);
  ctx.lineTo(rx + r, ry + rh);
  ctx.arcTo(rx, ry + rh, rx, ry + rh - r, r);
  ctx.lineTo(rx, ry + r);
  ctx.arcTo(rx, ry, rx + r, ry, r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Big opening quote mark
  ctx.font          = `bold ${bigMarkSz}px Kanit`;
  ctx.fillStyle     = layout.accentColor || '#ff6a13';
  ctx.globalAlpha   = 0.95;
  ctx.textBaseline  = 'top';
  ctx.shadowColor   = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur    = 10;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.fillText('”', bx, by);

  // Quote lines
  ctx.font      = `bold ${quoteFontSz}px Kanit`;
  ctx.fillStyle = layout.textColor || '#FFFFFF';
  ctx.shadowBlur = 6;
  let ty = by + bigMarkSz * 0.65;
  for (const line of lines) {
    ctx.fillText(line, bx, ty);
    ty += lineH;
  }

  // Author name
  ctx.font      = `${nameFontSz}px Kanit`;
  ctx.fillStyle = layout.accentColor || '#ff6a13';
  ctx.shadowBlur = 4;
  const nameText = `— ${authorName}`;
  const nameW    = ctx.measureText(nameText).width;
  const namePos  = layout.namePosition || 'bottom-left';
  let nx = namePos === 'bottom-right'  ? W - nameW - pad
         : namePos === 'bottom-center' ? (W - nameW) / 2
         : pad;
  ctx.fillText(nameText, nx, H - nameFontSz * 2 - pad);

  ctx.globalAlpha  = 1;
  ctx.shadowColor  = 'transparent';
  ctx.shadowBlur   = 0;

  const canvasBuf = canvas.toBuffer('image/png');
  const { format } = await sharp(sourceBuffer).metadata();
  const out = sharp(canvasBuf);
  const buf = await (format === 'png' ? out.png() : out.jpeg({ quality: 92 })).toBuffer();
  return { buffer: buf, ext: format === 'png' ? 'png' : 'jpg' };
}

module.exports = { fetchBuffer, applyWatermark, autoEnhance, applyQuoteOverlay };
