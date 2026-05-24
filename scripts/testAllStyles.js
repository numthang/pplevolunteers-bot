// scripts/testAllStyles.js
// Usage: node scripts/testAllStyles.js <image-path>
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { renderQuoteStyle } = require('../utils/quoteStyles');

const imgPath = process.argv[2];
if (!imgPath || !fs.existsSync(imgPath)) {
  console.error('Usage: node scripts/testAllStyles.js <image-path>');
  process.exit(1);
}

const QUOTE  = 'ผมยกเลิก LINE Subscription หมดเลยหันมาใช้ Discord';
const AUTHOR = 'นรพนธ์ พลายศรีนิล คณะทำงานพรรคประชาชนราชบุรี เขต 1';
const base   = imgPath.replace(/\.[^.]+$/, '');
const buf    = fs.readFileSync(imgPath);

(async () => {
  for (let i = 1; i <= 6; i++) {
    process.stdout.write(`🎨 Style ${i}... `);
    const { buffer } = await renderQuoteStyle(i, buf, { quoteText: QUOTE, authorName: AUTHOR });
    const out = `${base}_style${i}.jpg`;
    fs.writeFileSync(out, buffer);
    console.log(`✅ ${path.basename(out)}`);
  }
  console.log('\nเปิดดูทั้ง 6 ไฟล์แล้วบอกได้เลยครับ');
})().catch(err => { console.error('❌', err.message); process.exit(1); });
