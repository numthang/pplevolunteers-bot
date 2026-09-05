// เทสคีย์ cache ของ "รูปที่เตรียมแล้ว" ในคิวโพสต์ — จุดที่พังแล้วเงียบที่สุด
// (คีย์ชนกัน = แพลตฟอร์มหนึ่งได้รูปของอีกงานไปโพสต์ โดยไม่มี error ให้เห็นเลย)
// รัน: node scripts/test/publishWorkerCache.test.js
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

// กัน worker ต่อ DB จริงตอน require (pool สร้างตอน import)
require.cache[require.resolve(ROOT + '/db/index')] = { exports: { query: async () => ({ rows: [] }) } };

const { prepCacheKey } = require(ROOT + '/services/publishWorker');
let fail = 0;
const ok = (label, cond) => { if (!cond) fail++; console.log(`${cond ? '✅' : '❌'} ${label}`); };

const media = [{ kind: 'image', path: 'storage/posts/a.jpg' }, { kind: 'image', path: 'storage/posts/b.jpg' }];
const base = { batch_id: 'B1', media, wm_pos: 'bottom-right', platform: 'fb' };
const WM = '/root/assets/watermark/org_1/logo.png';

ok('งานเดียวกันคนละแพลตฟอร์ม → คีย์เดียวกัน (นี่คือประโยชน์ทั้งหมด)',
  prepCacheKey({ ...base, platform: 'fb' }, WM) === prepCacheKey({ ...base, platform: 'ig' }, WM));

ok('คนละ batch → คนละคีย์',
  prepCacheKey(base, WM) !== prepCacheKey({ ...base, batch_id: 'B2' }, WM));

ok('สื่อคนละชุด → คนละคีย์',
  prepCacheKey(base, WM) !== prepCacheKey({ ...base, media: [{ kind: 'image', path: 'storage/posts/c.jpg' }] }, WM));

ok('สื่อชุดเดิมแต่สลับลำดับ → คนละคีย์ (ลำดับรูปคือลำดับที่โพสต์)',
  prepCacheKey(base, WM) !== prepCacheKey({ ...base, media: [media[1], media[0]] }, WM));

ok('คนละไฟล์ลายน้ำ → คนละคีย์',
  prepCacheKey(base, WM) !== prepCacheKey(base, '/root/assets/watermark/user_9/logo.png'));

ok('ไม่มีลายน้ำ vs มีลายน้ำ → คนละคีย์',
  prepCacheKey(base, null) !== prepCacheKey(base, WM));

ok('คนละตำแหน่งลายน้ำ → คนละคีย์',
  prepCacheKey(base, WM) !== prepCacheKey({ ...base, wm_pos: 'top-left' }, WM));

ok('ไม่มี batch_id → null (ห้าม cache)', prepCacheKey({ ...base, batch_id: null }, WM) === null);
ok('ไม่มีรายการสื่อ → null (ห้าม cache)', prepCacheKey({ ...base, media: [] }, WM) === null);
ok('media ไม่ใช่ array → null (ห้าม cache)', prepCacheKey({ ...base, media: null }, WM) === null);
ok('job เป็น null → null ไม่ throw', prepCacheKey(null, WM) === null);

console.log(fail ? `\n❌ ตก ${fail} เคส` : '\n✅ ผ่านหมด');
process.exit(fail ? 1 : 0);
