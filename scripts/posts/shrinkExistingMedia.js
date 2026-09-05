// scripts/posts/shrinkExistingMedia.js — ไล่ย่อ "ไฟล์เก่า" ใน storage/posts แล้ว**ทับของเดิม**
//
// ตัวย่อรูดตอนอัปโหลด (utils/imageDownscale.js) คุมเฉพาะไฟล์ที่เข้ามาหลัง 2026-09-05
// ไฟล์ที่กองอยู่ก่อนหน้านั้นยังใหญ่เท่าเดิม (ใหญ่สุดที่เจอ: การ์ดคำคม PNG 35 MB ของโพสต์ 1051)
// → กินดิสก์ฟรี และตอนยิงโพสต์ต้อง decode+resize ใหม่ทุกครั้ง (~1.2 วิ/ใบ)
//
// ⛔ ไม่ใช่ migration โดยตั้งใจ — ต้องรันซ้ำได้เรื่อยๆ (node-pg-migrate จำว่า "รันแล้ว" ถาวร)
//
// รัน (prod):
//   sudo -u www bash -c "cd /www/wwwroot/pple-volunteers && node scripts/posts/shrinkExistingMedia.js"          ← ดูก่อน (ไม่แตะไฟล์)
//   sudo -u www bash -c "cd /www/wwwroot/pple-volunteers && node scripts/posts/shrinkExistingMedia.js --apply"  ← ทับจริง
//
// ธง:
//   --apply         เขียนจริง (ไม่ใส่ = dry run · รายงานอย่างเดียว ไม่แตะทั้งไฟล์และ DB)
//   --keep-format   ห้ามเปลี่ยนนามสกุล (png อยู่เป็น png) = ไม่ต้องแตะ path ใน DB เลย แต่ประหยัดน้อยกว่า
//   --min-mb=<n>    แตะเฉพาะไฟล์ที่ใหญ่กว่านี้ (ค่าเริ่มต้น 2)
//   --max-edge=<n>  ด้านยาวปลายทาง (ค่าเริ่มต้น 2048 — ตรงกับตัวย่อตอนอัปโหลด)
//   --limit=<n>     ทำแค่ n ไฟล์แรก (ไว้ลองน้ำก่อนปล่อยทั้งกอง)
//   --only=<ชื่อไฟล์> ทำไฟล์เดียว (ชื่อไฟล์ใน storage/posts เช่น --only=abc-123.png)
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { randomUUID } = require('crypto');
const pool = require('../../db/index');
const { shrinkImage, MAX_EDGE } = require('../../utils/imageDownscale');

const REPO_ROOT = path.join(__dirname, '..', '..');
const POSTS_DIR = path.join('storage', 'posts');
const THUMBS_DIR = path.join('storage', 'posts-thumbs');
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);

const args = process.argv.slice(2);
const has = f => args.includes(f);
const num = (f, d) => {
  const hit = args.find(a => a.startsWith(`${f}=`));
  const v = hit ? Number(hit.split('=')[1]) : NaN;
  return Number.isFinite(v) ? v : d;
};

const APPLY = has('--apply');
const KEEP_FORMAT = has('--keep-format');
const MIN_BYTES = num('--min-mb', 2) * 1024 * 1024;
const MAX_EDGE_OPT = num('--max-edge', MAX_EDGE);
const LIMIT = num('--limit', Infinity);
const ONLY = (args.find(a => a.startsWith('--only=')) || '').split('=')[1] || null;

const mb = n => (n / 1048576).toFixed(2) + ' MB';

/**
 * ย้าย path เก่า → ใหม่ในทุกคอลัมน์ที่เก็บ path ของไฟล์ posts
 *
 * ⚠️ มี 3 คอลัมน์เท่านั้น (ตรวจทั้ง repo แล้ว): `post_episode_media.path`, `.bg_path`, `post_assets.path`
 *    เพิ่มที่เก็บ path ใหม่เมื่อไหร่ **ต้องมาเพิ่มที่นี่ด้วย** ไม่งั้นไฟล์หายจากหน้าจอแบบเงียบๆ
 * ทำใน transaction เดียว — อัปเดตไม่ครบแล้วไฟล์เก่าถูกลบ = รูปหายถาวร
 */
async function repointPath(oldRel, newRel) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const a = await client.query('UPDATE post_episode_media SET path = $2 WHERE path = $1', [oldRel, newRel]);
    const b = await client.query('UPDATE post_episode_media SET bg_path = $2 WHERE bg_path = $1', [oldRel, newRel]);
    const c = await client.query('UPDATE post_assets SET path = $2 WHERE path = $1', [oldRel, newRel]);
    await client.query('COMMIT');
    return a.rowCount + b.rowCount + c.rowCount;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** คลังภาพเก็บ metadata ของไฟล์ไว้ด้วย — ย่อแล้วต้องอัปให้ตรง ไม่งั้น dedupe/หน้าคลังโกหก */
async function syncAssetMeta(relPath, buffer, width, height) {
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const { rowCount } = await pool.query(
    `UPDATE post_assets SET bytes = $2, sha256 = $3, width = $4, height = $5 WHERE path = $1`,
    [relPath, buffer.length, sha256, width ?? null, height ?? null]
  );
  return rowCount;
}

async function main() {
  const dir = path.join(REPO_ROOT, POSTS_DIR);
  const all = await fs.readdir(dir);
  const names = all.filter(n => IMAGE_EXTS.has(n.split('.').pop()?.toLowerCase()) && (!ONLY || n === ONLY));
  if (ONLY && !names.length) throw new Error(`ไม่พบไฟล์ ${ONLY} ใน ${POSTS_DIR}`);

  // คัดผู้เข้าแข่งก่อน เพื่อบอก total ได้ตั้งแต่ต้น (กติกาสคริปต์ใน CLAUDE.md)
  const targets = [];
  for (const name of names) {
    const st = await fs.stat(path.join(dir, name)).catch(() => null);
    // --only = เจาะจงไฟล์เดียว ข้ามเพดานขนาดไปเลย (คนสั่งชื่อไฟล์มาแล้ว ไม่ต้องมาเดาให้)
    if (st?.isFile() && (ONLY || st.size > MIN_BYTES)) targets.push({ name, size: st.size });
  }
  targets.sort((x, y) => y.size - x.size);
  const work = targets.slice(0, LIMIT);

  console.log(`ไฟล์รูปทั้งหมด ${names.length} · ใหญ่เกิน ${mb(MIN_BYTES)} = ${targets.length} ไฟล์` +
    (work.length < targets.length ? ` (ทำรอบนี้ ${work.length})` : ''));
  console.log(`โหมด: ${APPLY ? '⚠️  เขียนจริง' : 'ดูก่อน (dry run)'} · ด้านยาว ≤ ${MAX_EDGE_OPT}px` +
    `${KEEP_FORMAT ? ' · คงนามสกุลเดิม' : ' · ยอมเปลี่ยนนามสกุล (อัปเดต path ใน DB ให้)'}\n`);
  if (!work.length) return;

  let done = 0, skipped = 0, failed = 0, before = 0, after = 0, repointed = 0;

  for (const { name, size } of work) {
    const relPath = path.join(POSTS_DIR, name);
    const absPath = path.join(dir, name);
    const ext = name.split('.').pop().toLowerCase();
    try {
      const buffer = await fs.readFile(absPath);
      const fit = await shrinkImage(buffer, { ext, maxEdge: MAX_EDGE_OPT, keepFormat: KEEP_FORMAT });
      if (!fit.changed || fit.buffer.length >= buffer.length) { skipped++; continue; }

      before += size;
      after += fit.buffer.length;

      if (!APPLY) {
        console.log(`  [ดูก่อน] ${name} ${mb(size)} → ${mb(fit.buffer.length)}${fit.ext !== ext ? ` (.${ext} → .${fit.ext})` : ''}`);
        done++;
        continue;
      }

      const newName = fit.ext === ext ? name : `${name.slice(0, -(ext.length + 1))}.${fit.ext}`;
      const newRel = path.join(POSTS_DIR, newName);
      const newAbs = path.join(dir, newName);

      // เขียนแบบ atomic เสมอ — ไฟล์ครึ่งๆ ที่ยังมีแถวชี้อยู่คือรูปเสียถาวร
      const tmp = `${newAbs}.tmp-${randomUUID()}`;
      await fs.writeFile(tmp, fit.buffer);

      if (newName === name) {
        await fs.rename(tmp, newAbs);            // ทับที่เดิม — ไม่ต้องแตะ path ใน DB
      } else {
        await fs.rename(tmp, newAbs);
        try {
          repointed += await repointPath(relPath, newRel);
        } catch (err) {
          await fs.unlink(newAbs).catch(() => {});   // DB ไม่ยอมย้าย = ไฟล์เก่าต้องอยู่ต่อ
          throw err;
        }
        await fs.unlink(absPath).catch(() => {});    // ลบของเดิมหลัง DB ชี้ที่ใหม่แล้วเท่านั้น
      }

      // thumbnail แคชด้วยชื่อไฟล์ (ไม่ดู mtime) → ลบทิ้งให้สร้างใหม่จากไฟล์ที่เล็กลงแล้ว
      const base = name.slice(0, -(ext.length + 1));
      await fs.unlink(path.join(REPO_ROOT, THUMBS_DIR, `${base}.webp`)).catch(() => {});

      let width = null, height = null;
      try {
        const m = await require('sharp')(fit.buffer).metadata();
        width = m.width ?? null;
        height = m.height ?? null;
      } catch { /* อ่านขนาดไม่ได้ = เก็บ null ดีกว่าเก็บของเดิมที่ผิดแล้ว */ }
      await syncAssetMeta(newRel, fit.buffer, width, height);

      done++;
      process.stdout.write(`\r  ${done}/${work.length} (ข้าม ${skipped} · ล้ม ${failed})   `);
    } catch (err) {
      failed++;
      console.error(`\n  ❌ ${name}: ${err.message}`);
    }
  }

  console.log(`\n\n${APPLY ? 'ย่อแล้ว' : '[ดูก่อน] จะย่อ'} ${done} ไฟล์ · ข้าม ${skipped} · ล้ม ${failed}`);
  console.log(`พื้นที่: ${mb(before)} → ${mb(after)} (${APPLY ? 'คืนได้' : 'จะคืนได้'} ${mb(before - after)})`);
  if (APPLY && repointed) console.log(`อัปเดต path ใน DB: ${repointed} แถว`);
  if (!APPLY) console.log('\nพอใจแล้วรันซ้ำด้วย --apply');
}

main()
  .then(() => pool.end())
  .catch(err => { console.error(err); pool.end(); process.exit(1); });
