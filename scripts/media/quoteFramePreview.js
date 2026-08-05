// scripts/media/quoteFramePreview.js — เรนเดอร์การ์ด frame-right เทียบหลายค่าระยะในภาพเดียว
//
// ที่มา (2026-08-06): ปรับระยะทีละนิดแล้วให้คนดูในพรีวิวเล็กๆ = มองไม่ออกว่าเปลี่ยนอะไร
// เสียเวลาไป-กลับหลายรอบ · ให้เรนเดอร์ตัวเลือกวางข้างกันแล้วให้คนชี้เอาเลยเร็วกว่ามาก
//
// รัน:
//   node scripts/media/quoteFramePreview.js <รูป> --set padTop=0.8,gapAuth=0.6 --set padTop=0.4
//   node scripts/media/quoteFramePreview.js <รูป> --sweep line=0.52,0.62,0.72
//   ไม่ใส่ --set/--sweep = เรนเดอร์ค่าปัจจุบันใบเดียว
//
// ค่าที่ปรับได้ = คีย์ใน FRAME_RIGHT ของ utils/quoteStyles.js
//   stroke · padTop · padX · gapAuth · authorTop · line · barLen
//
// ผลลัพธ์: ~/Downloads/quote-frame-preview.png (เปลี่ยนที่ได้ด้วย --out)
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { renderQuoteStyle, FRAME_RIGHT } = require('../../utils/quoteStyles');

const args = process.argv.slice(2);
const imgPath = args.find(a => !a.startsWith('--'));
if (!imgPath || !fs.existsSync(imgPath)) {
  console.error('ใช้: node scripts/media/quoteFramePreview.js <รูป> [--set k=v,k=v] [--sweep k=v1,v2,v3] [--out ไฟล์]');
  process.exit(1);
}

const flag = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const OUT   = flag('out', path.join(os.homedir(), 'Downloads', 'quote-frame-preview.png'));
const TEXT  = flag('text', 'ผมนั่งเงียบๆ อยู่หน้าจอทั้ง\nวัน คุยกับ Claude แทบ\nทั้งวันทั้งคืน เพื่อปั้นระบบ\nหลังบ้านให้ทีมอาสาสมัคร');
const AUTHOR = flag('author', 'ทีมสื่อ พรรคประชาชน');
const ACCENT = flag('accent', '#ff6a13');
const ZOOM   = args.includes('--zoom');   // ครอปเฉพาะโซนล่าง (ดูเส้นกับบรรทัดชื่อชัดๆ)

// --set ซ้ำได้หลายครั้ง = หลายตัวเลือก · --sweep k=v1,v2,v3 = แตกเป็นตัวเลือกละค่า
const variants = [];
args.forEach((a, i) => {
  if (a === '--set') {
    const over = {};
    for (const kv of args[i + 1].split(',')) {
      const [k, v] = kv.split('=');
      over[k.trim()] = Number(v);
    }
    variants.push(over);
  }
  if (a === '--sweep') {
    const [k, list] = args[i + 1].split('=');
    for (const v of list.split(',')) variants.push({ [k.trim()]: Number(v) });
  }
});
if (!variants.length) variants.push({});

const label = o => Object.entries(o).map(([k, v]) => `${k}=${v}`).join(' ') || 'ค่าปัจจุบัน';

(async () => {
  const base = { ...FRAME_RIGHT };
  const src = await sharp(imgPath).resize(1080, 1080, { fit: 'cover', position: 'attention' }).jpeg().toBuffer();

  const tiles = [];
  for (const over of variants) {
    Object.assign(FRAME_RIGHT, base, over);          // ปรับค่าชั่วคราวแล้วคืนค่าเดิมท้ายสุด
    const { buffer } = await renderQuoteStyle('quote-1-frame-right', src, {
      quoteText: TEXT, authorName: AUTHOR, saturation: 1.0, accentColor: ACCENT,
    });
    const shot = ZOOM
      ? await sharp(buffer).extract({ left: 150, top: 780, width: 930, height: 300 }).resize(700, 226).png().toBuffer()
      : await sharp(buffer).resize(460, 460).png().toBuffer();
    tiles.push({ shot, text: label(over) });
  }
  Object.assign(FRAME_RIGHT, base);

  const tw = ZOOM ? 700 : 460, th = ZOOM ? 226 : 460;
  const cols = ZOOM ? 1 : Math.min(3, tiles.length);
  const rows = Math.ceil(tiles.length / cols);
  const cv = createCanvas(cols * (tw + 20) + 20, rows * (th + 46) + 20);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(0, 0, cv.width, cv.height);

  for (let i = 0; i < tiles.length; i++) {
    const x = 20 + (i % cols) * (tw + 20);
    const y = 46 + Math.floor(i / cols) * (th + 46);
    ctx.drawImage(await loadImage(tiles[i].shot), x, y);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`${i + 1}. ${tiles[i].text}`, x, y - 14);   // ป้ายเป็น ASCII เท่านั้น (canvas ไม่มีฟอนต์ไทยของระบบ)
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, cv.toBuffer('image/png'));
  console.log(`เขียน ${OUT} (${tiles.length} ตัวเลือก)`);
})().catch(err => { console.error(err); process.exitCode = 1; });
