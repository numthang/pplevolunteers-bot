/**
 * backfillPostCreatedAt.js — แก้ post_episodes.created_at ของโพสต์ที่มาจาก Discord ให้ตรงวันที่ตั้งกระทู้จริง
 *
 * บั๊กที่แก้: createImportedPost() (db/postsImport.js) ไม่เคยรับ created_at มาก่อน → ใช้ NOW() ตอน insert เสมอ
 * โพสต์ที่ "นำเข้ากระทู้เก่า" (postImportHandler.js manual import + backfillPostThreads.js bulk backfill)
 * เลยได้ created_at = เวลาที่กดนำเข้า/รันสคริปต์ ไม่ใช่เวลาที่ตั้งกระทู้จริง
 *
 * แก้ที่ต้นทาง (createImportedPost รับ created_at override แล้ว) แยกไปแล้ว — สคริปต์นี้ backfill ของเก่าที่มีอยู่
 *
 * ไม่ยิง Discord API เลย — channel_id ที่บันทึกไว้แล้วเป็น snowflake ของกระทู้ต้นทาง
 * ซึ่งเข้ารหัสเวลาสร้างอยู่ในตัว ถอดตรงๆ ได้ (สูตรเดียวกับ backfillCaseCreatedAt.js)
 *
 * Usage:
 *   node scripts/data/backfillPostCreatedAt.js --dry-run     ← ดูรายการที่จะเปลี่ยนก่อนเสมอ
 *   node scripts/data/backfillPostCreatedAt.js               ← รันจริง
 *
 * Prod: sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/data/backfillPostCreatedAt.js --dry-run'
 *
 * ขอบเขต: เฉพาะแถวที่มี channel_id (โพสต์ที่ยื่นผ่านเว็บฟอร์มไม่มีค่านี้ ไม่ถูกแตะ)
 *         ข้ามแถวที่ต่างกันไม่ถึง 1 ชั่วโมง (สร้างสด/ผ่านสคริปต์รอบนี้ ค่าใกล้เคียงอยู่แล้ว)
 */
require('dotenv').config();
const pool = require('../../db/index');

const DRY_RUN = process.argv.includes('--dry-run');

// สูตรถอด snowflake เดียวกับ backfillPostThreads.js / backfillCaseCreatedAt.js
const DISCORD_EPOCH = 1420070400000n;
const createdAtOf = (id) => new Date(Number((BigInt(id) >> 22n) + DISCORD_EPOCH));

const ONE_HOUR_MS = 60 * 60 * 1000;

(async () => {
  console.log(DRY_RUN ? '=== DRY RUN (ไม่เขียน DB) ===' : '=== backfillPostCreatedAt ===');

  const { rows } = await pool.query(
    `SELECT id, title, channel_id, created_at FROM post_episodes WHERE channel_id IS NOT NULL ORDER BY id`,
  );
  console.log(`Fetched ${rows.length} posts ที่มี channel_id, checking...`);

  const toFix = [];
  for (const r of rows) {
    let correct;
    try {
      correct = createdAtOf(r.channel_id);
    } catch {
      console.error(`  [skip] post ${r.id}: channel_id ถอดไม่ได้ (${r.channel_id})`);
      continue;
    }
    const diffMs = Math.abs(new Date(r.created_at).getTime() - correct.getTime());
    if (diffMs > ONE_HOUR_MS) toFix.push({ ...r, correct, diffMs });
  }

  console.log(`ต้องแก้ ${toFix.length}/${rows.length} ใบ (ต่างกัน >1 ชม.)`);
  for (const p of toFix) {
    const diffDays = (p.diffMs / (24 * ONE_HOUR_MS)).toFixed(1);
    console.log(`  post ${p.id} "${(p.title || '').slice(0, 40)}"  ${new Date(p.created_at).toISOString().slice(0, 10)} → ${p.correct.toISOString().slice(0, 10)}  (ต่าง ${diffDays} วัน)`);
  }

  if (DRY_RUN || !toFix.length) {
    await pool.end();
    return;
  }

  let done = 0, errs = 0;
  for (const p of toFix) {
    try {
      await pool.query(`UPDATE post_episodes SET created_at = $2 WHERE id = $1`, [p.id, p.correct]);
      done++;
      process.stdout.write(`\r  ${done}/${toFix.length}`);
    } catch (e) {
      errs++;
      console.error(`\n  [err] post ${p.id}:`, e.message);
    }
  }
  console.log(`\nDone: ${done} updated, ${errs} errors`);

  await pool.end();
})();
