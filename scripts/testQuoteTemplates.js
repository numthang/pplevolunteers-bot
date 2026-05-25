// scripts/testQuoteTemplates.js
// Usage: node scripts/testQuoteTemplates.js <image-path> [--no-shorten]
require('dotenv').config({ override: true });
const fs   = require('fs');
const path = require('path');
const { renderQuoteStyle } = require('../utils/quoteStyles');
const { shortenQuote }     = require('../services/aiLayout');

const CACHE_FILE = path.join(__dirname, '.quote_cache.json');

const imgPath = process.argv[2];
if (!imgPath || !fs.existsSync(imgPath)) {
  console.error('Usage: node scripts/testQuoteTemplates.js <image-path> [--no-shorten]');
  process.exit(1);
}

const AUTHOR = 'นรพนธ์ คณะทำงานพรรคประชาชนราชบุรี';
const base   = imgPath.replace(/\.[^.]+$/, '');
const noShorten = process.argv.includes('--no-shorten');

const SAT_MODES = [
  { tag: 'bw',    saturation: 0.15 },
  { tag: 'mid',   saturation: 0.55 },
  { tag: 'color', saturation: 1.0  },
];

const TEST_CASES = [
  {
    tag: '3line',
    quote: 'ตั้งแต่ได้รู้จัก Discord ผมแทบไม่ได้\nกลับไปใช้ Line อีกเลย ตอนนี้เปลี่ยน\nระบบองค์กรมาใช้ Discord ทั้งหมดแล้ว',
  },
  {
    tag: '4line',
    quote: 'ตั้งแต่ได้รู้จัก Discord\nผมแทบไม่ได้กลับไปใช้ Line\nตอนนี้เปลี่ยนระบบสื่อสาร\nภายในองค์กรทั้งหมดแล้ว',
  },
  {
    tag: '5line',
    quote: 'ตั้งแต่ได้รู้จัก Discord ผมแทบไม่ได้\nกลับไปใช้ Line อีกเลย ตอนนี้ถึงขั้น\nเปลี่ยนระบบการสื่อสารภายในองค์กร\nทุกสาขามาใช้ Discord ทั้งหมดแล้ว\nเพราะรู้สึกว่ามันเป็นระบบมากกว่า',
  },
];

// filter: --bw / --mid / --color (ถ้าไม่ระบุ = ทุก mode)
const satFilter = process.argv.find(a => ['--bw','--mid','--color'].includes(a))?.replace('--','');
const activeSats = satFilter ? SAT_MODES.filter(s => s.tag === satFilter) : SAT_MODES;

const ALL_STYLES = ['Quote-1-ember-left', 'Quote-1-ember-right', 'Quote-1-pillar-left', 'Quote-1-frame-right'];

// filter: --style Quote-1-ember-left (ถ้าไม่ระบุ = ทุก style)
const styleArg = process.argv.indexOf('--style');
const styleFilter = styleArg !== -1
  ? [process.argv[styleArg + 1]]
  : ALL_STYLES;

(async () => {
  const src = fs.readFileSync(imgPath);
  for (const { tag: satTag, saturation } of activeSats) {
    console.log(`\n════ ${satTag} (sat=${saturation}) ════`);
    const cases = TEST_CASES;
    for (const { tag, quote } of cases) {
      console.log(`  ── ${tag} ──`);
      for (const i of styleFilter) {
        process.stdout.write(`    🎨 ${i}...`);
        const { buffer, ext } = await renderQuoteStyle(i, src, { quoteText: quote, authorName: AUTHOR, saturation });
        const out = `${base}_${satTag}_${tag}_${i}.${ext}`;
        fs.writeFileSync(out, buffer);
        console.log(` ✅ ${path.basename(out)}`);
      }
    }
  }
  console.log('\nดูไฟล์ใน', path.dirname(path.resolve(imgPath)));
})().catch(err => { console.error('❌', err.message); process.exit(1); });
