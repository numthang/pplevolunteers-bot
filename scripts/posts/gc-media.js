// เก็บกวาดไฟล์ "กำพร้า" ใน storage/posts — ไฟล์ที่ไม่มีแถวไหนใน DB อ้างถึงแล้ว
//
// รัน:  node scripts/posts/gc-media.js --dry      (ดูก่อน ไม่ลบจริง)
//       node scripts/posts/gc-media.js            (ลบจริง)
//       node scripts/posts/gc-media.js --days=30  (เปลี่ยนอายุขั้นต่ำ · default 7)
// PRODUCTION: sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/posts/gc-media.js'
//
// ── ต่างจาก services/postsRetention.js ยังไง (อย่าสับสน 2 ตัวนี้) ───────────────
//   postsRetention  ลบไฟล์ที่ **ยังมีแถวอ้างอยู่** แต่หมดหน้าที่แล้ว (โพสต์ออกไปแล้ว 30/180 วัน)
//                   → ลบไฟล์ + เซ็ต path = NULL  (แถวยังอยู่)
//   gc-media (ตัวนี้) ลบไฟล์ที่ **ไม่มีใครอ้างเลย** — ไม่แตะ DB สักแถว
//
// ที่มา (grill ข้อ 6): ลบตอน/โพสต์แบบถาวรจะ cascade แถวทิ้ง แต่จงใจไม่ unlink ไฟล์ทันที
// และตั้งแต่มี Quote Generator ยังมีอีกทางที่สร้างขยะประจำ: ผู้ใช้อัปรูปพื้นหลังใน modal
// แล้วกดยกเลิก → ไฟล์ถูกเขียนลงดิสก์ไปแล้วแต่ไม่มีแถวไหนอ้าง (ตั้งใจไม่สร้างแถว ตามกฎ
// "ห้ามสร้าง record ก่อนกดบันทึก") · เทสรอบเดียวเคยเหลือขยะ 5 ไฟล์
//
// ⚠️ 4 ที่ที่ต้องนับเป็น "มีคนอ้าง" — ตกไปที่เดียวคือลบไฟล์ที่ยังใช้งานอยู่:
//   1. post_episode_media.path      รูป/คลิป/การ์ดที่แนบโพสต์
//   2. post_episode_media.bg_path   พื้นหลังของการ์ดคำคม — **ไม่มีแถวเป็นของตัวเอง**
//                                   ลบทิ้ง = แก้ข้อความแล้ว render การ์ดใหม่ไม่ได้อีกเลย
//   3. post_social_history.media[].path  snapshot ตอนสั่งโพสต์ — worker อ่านไฟล์จาก path นี้
//                                   งานที่ยัง pending อ่านไม่เจอ = โพสต์ล้ม
//   4. post_assets.path             คลังภาพ — **ไม่มี retention ไม่ผูกกับโพสต์ไหนเลย**
//                                   ตกไป = รูปในคลังที่ยังไม่มีใครหยิบไปใช้โดนลบทิ้งใน 7 วัน
const fs = require('fs/promises');
const path = require('path');
const pool = require('../../db/index');
const storage = require('../../utils/postsStorage');

const DRY = process.argv.includes('--dry');
const daysArg = process.argv.find(a => a.startsWith('--days='));
const MIN_AGE_DAYS = daysArg ? Number(daysArg.split('=')[1]) : 7;

const mb = n => (n / 1048576).toFixed(1);

/** ทุก path ที่ยังมีคนอ้างถึง (relative จาก repo root) */
async function collectReferenced() {
  const refs = new Set();
  const add = p => { if (p) refs.add(String(p)); };

  const { rows: media } = await pool.query(
    `SELECT path, bg_path FROM post_episode_media WHERE path IS NOT NULL OR bg_path IS NOT NULL`
  );
  for (const r of media) { add(r.path); add(r.bg_path); }

  // jsonb → แตกเป็นแถวแล้วดึง path ออกมา (ทำใน SQL ปลอดภัยกว่ามา parse เอง)
  const { rows: jobs } = await pool.query(
    `SELECT DISTINCT m->>'path' AS path
       FROM post_social_history h, jsonb_array_elements(h.media) m
      WHERE m->>'path' IS NOT NULL`
  );
  for (const r of jobs) add(r.path);

  // คลังภาพ — ไฟล์ที่ตั้งใจเก็บ ไม่มีโพสต์ไหนอ้าง จึงต้องนับตรงนี้เอง
  const { rows: assets } = await pool.query(
    `SELECT path FROM post_assets WHERE path IS NOT NULL`
  );
  for (const r of assets) add(r.path);

  return refs;
}

async function main() {
  if (!Number.isFinite(MIN_AGE_DAYS) || MIN_AGE_DAYS < 0) {
    console.error('--days ต้องเป็นตัวเลข >= 0');
    process.exit(1);
  }

  const dir = path.resolve(storage.REPO_ROOT, storage.POSTS_DIR);
  let names;
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') { console.log('ยังไม่มีโฟลเดอร์ storage/posts — ไม่มีอะไรให้เก็บกวาด'); return; }
    throw err;
  }

  const refs = await collectReferenced();
  const cutoff = Date.now() - MIN_AGE_DAYS * 86400_000;
  console.log(
    `พบไฟล์ ${names.length} ไฟล์ · มีแถวอ้างถึง ${refs.size} path · ` +
    `เก็บกวาดที่เก่ากว่า ${MIN_AGE_DAYS} วัน${DRY ? ' (dry-run)' : ''}`
  );

  let checked = 0, removed = 0, bytes = 0, tooNew = 0, errors = 0;

  for (const name of names) {
    checked++;
    // พิมพ์ตอนต้นลูป = ยอดของไฟล์ตัวปัจจุบันยังไม่ถูกนับ → บรรทัดสรุปตัวจริงพิมพ์หลังลูปจบ
    if (checked % 50 === 0) {
      process.stdout.write(`\r  ${checked}/${names.length} (ลบ ${removed} · ยังใหม่ ${tooNew} · error ${errors})`);
    }

    const rel = path.join(storage.POSTS_DIR, name);
    if (refs.has(rel)) continue;                       // มีคนอ้าง = ไม่ใช่กำพร้า

    try {
      const st = await fs.stat(path.join(dir, name));
      if (!st.isFile()) continue;
      // กันลบของที่เพิ่งอัป — ผู้ใช้อาจกำลังเปิด modal ค้างอยู่ ยังไม่กดบันทึก
      if (st.mtimeMs > cutoff) { tooNew++; continue; }

      if (!DRY) await fs.unlink(path.join(dir, name));
      removed++; bytes += st.size;
    } catch (err) {
      errors++;
      console.error(`\n  ข้าม ${name}: ${err.message}`);
    }
  }

  process.stdout.write(`\r  ${checked}/${names.length} (ลบ ${removed} · ยังใหม่ ${tooNew} · error ${errors})\n`);
  console.log(
    `เสร็จ: ${DRY ? 'จะลบ' : 'ลบแล้ว'} ${removed} ไฟล์ · คืนพื้นที่ ${mb(bytes)} MB · ` +
    `ยังใหม่เกินไป ${tooNew} · error ${errors}`
  );
  if (DRY && removed) console.log('รันซ้ำโดยไม่ใส่ --dry เพื่อลบจริง');

  await gcThumbs(refs);
}

// thumbnail เป็นแค่ cache ที่สร้างใหม่ได้เสมอ (web/lib/postsThumbs.js) — จงใจไม่ผูกกับขาลบไฟล์ต้นฉบับ
// (ขาลบมี 2 ฝั่งคนละโมดูล web/lib กับ utils/ — แขวนสองที่ = เพิ่มตะเข็บฟรีๆ) gc เก็บกวาดทีเดียวจบแทน
async function gcThumbs(refs) {
  const THUMBS_DIR = path.join('storage', 'posts-thumbs');
  const dir = path.resolve(storage.REPO_ROOT, THUMBS_DIR);

  let names;
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return;   // ยังไม่เคยสร้าง thumb เลย — ข้ามเงียบๆ
    throw err;
  }

  // basename (ตัดนามสกุล) ของทุก path ที่ยังมีคนอ้างถึง — thumb ตั้งชื่อตาม basename ต้นฉบับ
  const referencedBase = new Set([...refs].map(p => path.basename(p, path.extname(p))));
  const tmpCutoff = Date.now() - 3600_000;   // ไฟล์ .tmp-* ค้าง <1 ชม. อาจกำลังเขียนอยู่ ยังไม่ลบ

  let checked = 0, removed = 0, bytes = 0, errors = 0;

  for (const name of names) {
    checked++;
    const isTmp = name.includes('.tmp-');
    // ไฟล์ tmp ชื่อ "<base>.webp.tmp-<uuid>" — ตัด .tmp-<uuid> ก่อนแล้วค่อยตัด .webp
    const stripped = isTmp ? name.slice(0, name.indexOf('.tmp-')) : name;
    const base = path.basename(stripped, path.extname(stripped));
    if (referencedBase.has(base)) continue;   // ต้นฉบับยังมีคนอ้าง = thumb ไม่กำพร้า

    const full = path.join(dir, name);
    try {
      const st = await fs.stat(full);
      if (!st.isFile()) continue;
      if (isTmp && st.mtimeMs > tmpCutoff) continue;   // tmp ใหม่ อาจกำลังเขียนอยู่

      if (!DRY) await fs.unlink(full);
      removed++; bytes += st.size;
    } catch (err) {
      errors++;
      console.error(`\n  [thumbs] ข้าม ${name}: ${err.message}`);
    }
  }

  console.log(
    `[thumbs] เสร็จ: ${DRY ? 'จะลบ' : 'ลบแล้ว'} ${removed}/${checked} ไฟล์ · คืนพื้นที่ ${mb(bytes)} MB · error ${errors}`
  );
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end());
