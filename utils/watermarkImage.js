// utils/watermarkImage.js
const sharp = require('sharp');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const https = require('https');
const http = require('http');

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
    return {
      x: Math.round(pad + Math.random() * (imgW - wmW - pad * 2)),
      y: Math.round(pad + Math.random() * (imgH - wmH - pad * 2)),
    };
  }
  switch (position) {
    case 'bottom-left': return { x: pad,              y: imgH - wmH - pad };
    case 'center':      return { x: (imgW - wmW) / 2, y: (imgH - wmH) / 2 };
    case 'top-right':   return { x: imgW - wmW - pad, y: pad };
    default:            return { x: imgW - wmW - pad, y: imgH - wmH - pad }; // bottom-right
  }
}

// ── Image watermark (sharp — Lanczos3) ────────────────────────────────────────
async function applyImageWatermark(sourceBuffer, { imagePath, position, opacity }) {
  const { width: W, height: H } = await sharp(sourceBuffer).metadata();

  const wmW = Math.round(Math.max(W, H) * 0.15);

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
async function applyWatermark(sourceBuffer, { text, imagePath, position, opacity }) {
  if (imagePath) {
    return applyImageWatermark(sourceBuffer, { imagePath, position, opacity });
  }
  return applyTextWatermark(sourceBuffer, { text, position, opacity });
}

module.exports = { fetchBuffer, applyWatermark };
