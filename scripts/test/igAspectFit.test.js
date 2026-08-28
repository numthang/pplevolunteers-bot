// เทสตัวเติมขอบให้รูปเข้ากรอบสัดส่วนของ IG (4:5 – 1.91:1) — ไม่ยิงออกเน็ต ใช้ sharp ล้วน
// รัน: node scripts/test/igAspectFit.test.js
const sharp = require('sharp');
const { fitImagesForIg } = require('../../services/metaApi');

const img = (w, h, opts = {}) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 80, b: 20 } } })
  .withMetadata(opts).jpeg().toBuffer().then(buffer => ({ buffer, ext: 'jpg' }));

const ratioOf = async buf => { const m = await sharp(buf).metadata(); return { w: m.width, h: m.height, r: m.width / m.height }; };

let failed = 0;
function check(name, cond, detail) {
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
}

(async () => {
  // สูงเกิน 4:5 (จอมือถือ 9:16) → ต้องถูกเติมขอบซ้ายขวาจนได้ 0.8 พอดี
  const [tall] = await fitImagesForIg([await img(1080, 1920)]);
  const t = await ratioOf(tall.buffer);
  check('รูปสูง 9:16 → 4:5', Math.abs(t.r - 0.8) < 0.01, `${t.w}x${t.h} r=${t.r.toFixed(3)}`);
  check('รูปสูง: กว้างไม่เกิน 1440', t.w <= 1440, `w=${t.w}`);

  // กว้างเกิน 1.91 (พาโนรามา) → เติมขอบบนล่าง
  const [wide] = await fitImagesForIg([await img(3000, 1000)]);
  const w = await ratioOf(wide.buffer);
  check('รูปกว้าง 3:1 → 1.91:1', Math.abs(w.r - 1.91) < 0.01, `${w.w}x${w.h} r=${w.r.toFixed(3)}`);

  // อยู่ในกรอบอยู่แล้ว → ต้องคืน buffer เดิม (ห้าม re-encode ทิ้งคุณภาพฟรีๆ)
  const ok = await img(1080, 1350);
  const [same] = await fitImagesForIg([ok]);
  check('4:5 อยู่แล้ว → ไม่แตะ', same.buffer === ok.buffer);

  // carousel: ยึดสัดส่วนใบแรก แล้วดันใบที่เหลือให้เท่ากัน (ไม่งั้น IG ครอบใบหลังทิ้งเอง)
  const set = await fitImagesForIg([await img(1080, 1350), await img(1920, 1080), await img(1080, 1080)]);
  const rs = await Promise.all(set.map(i => ratioOf(i.buffer)));
  check('carousel เท่ากันทุกใบ = ใบแรก', rs.every(x => Math.abs(x.r - 0.8) < 0.01), rs.map(x => x.r.toFixed(3)).join(' / '));

  // EXIF orientation 6 = รูปตะแคง → ขนาดจริงหลังหมุนคือ 1920x1080 (1.78) ซึ่งอยู่ในกรอบ ห้ามเผลอเติมขอบ
  const rotated = await img(1080, 1920, { orientation: 6 });
  const [rot] = await fitImagesForIg([rotated]);
  check('EXIF orientation ไม่หลอกให้เติมขอบ', rot.buffer === rotated.buffer);

  console.log(failed ? `\n${failed} เคสไม่ผ่าน` : '\nผ่านหมด');
  process.exit(failed ? 1 : 0);
})();
