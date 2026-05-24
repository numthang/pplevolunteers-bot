// scripts/testQuoteOverlay.js
// Usage: node scripts/testQuoteOverlay.js <image-path>
// Example: node scripts/testQuoteOverlay.js /tmp/photo.jpg

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { analyzeLayout } = require('../services/aiLayout');
const { applyQuoteOverlay } = require('../utils/watermarkImage');

const imgPath = process.argv[2] || path.join(__dirname, '../assets/watermark/pple-orange.png');

if (!fs.existsSync(imgPath)) {
  console.error(`❌ ไม่พบไฟล์: ${imgPath}`);
  process.exit(1);
}

const ext      = path.extname(imgPath).toLowerCase();
const mimeMap  = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const mimeType = mimeMap[ext] || 'image/jpeg';

(async () => {
  const buf = fs.readFileSync(imgPath);

  console.log(`📸 รูป: ${imgPath}`);
  console.log('🤖 กำลังส่ง Claude วิเคราะห์...\n');

  const layout = await analyzeLayout(buf, mimeType);
  console.log('✅ ผล layout จาก AI:');
  console.log(JSON.stringify(layout, null, 2));

  // Render sample overlay
  const outPath = imgPath.replace(/\.[^.]+$/, '') + '_quote_test.jpg';
  const { buffer } = await applyQuoteOverlay(buf, {
    quoteText:  'ผมยกเลิก LINE Subscription หมดเลยหันมาใช้ Discord',
    authorName: 'นรพนธ์ พลายศรีนิล คณะทำงานพรรคประชาชนราชบุรี เขต 1',
    layout,
  });
  fs.writeFileSync(outPath, buffer);
  console.log(`\n🖼️  บันทึกรูปตัวอย่างที่: ${outPath}`);
})().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
