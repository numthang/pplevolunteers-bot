/**
 * backfillCaseCreatedAt.js — แก้ cases.created_at ของเคสที่มาจาก Discord ให้ตรงวันที่ตั้งกระทู้จริง
 *
 * บั๊กที่แก้: createCase() (db/case.js) ไม่เคยรับ created_at มาก่อน → ใช้ NOW() ตอน insert เสมอ
 * เคสที่ "นำเข้ากระทู้เก่า" (caseImportHandler.js manual import + backfillCaseThreads.js bulk backfill)
 * เลยได้ created_at = เวลาที่กดนำเข้า ไม่ใช่เวลาที่ตั้งกระทู้จริง
 *
 * แก้ที่ต้นทาง (createCase รับ created_at override แล้ว) แยกไปแล้ว — สคริปต์นี้ backfill ของเก่าที่มีอยู่
 *
 * ไม่ยิง Discord API เลย — discord_thread_id ที่บันทึกไว้แล้วเป็น snowflake ซึ่งเข้ารหัส
 * เวลาสร้างอยู่ในตัว ถอดตรงๆ ได้ (สูตรเดียวกับ backfillCaseThreads.js บรรทัด createdAtOf)
 *
 * Usage:
 *   node scripts/data/backfillCaseCreatedAt.js --dry-run     ← ดูรายการที่จะเปลี่ยนก่อนเสมอ
 *   node scripts/data/backfillCaseCreatedAt.js               ← รันจริง
 *
 * Prod: sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/data/backfillCaseCreatedAt.js --dry-run'
 *
 * ขอบเขต: เฉพาะแถวที่มี discord_thread_id (เคสที่ยื่นผ่านเว็บฟอร์มไม่มีค่านี้ ไม่ถูกแตะ)
 *         ข้ามแถวที่ต่างกันไม่ถึง 1 ชั่วโมง (สร้างสด/auto-import ตอนตั้งกระทู้ใหม่ ค่าใกล้เคียงอยู่แล้ว)
 */
require('dotenv').config();
const pool = require('../../db/index');

const DRY_RUN = process.argv.includes('--dry-run');

// สูตรถอด snowflake เดียวกับ backfillCaseThreads.js
const DISCORD_EPOCH = 1420070400000n;
const createdAtOf = (id) => new Date(Number((BigInt(id) >> 22n) + DISCORD_EPOCH));

const ONE_HOUR_MS = 60 * 60 * 1000;

(async () => {
  console.log(DRY_RUN ? '=== DRY RUN (ไม่เขียน DB) ===' : '=== backfillCaseCreatedAt ===');

  const { rows } = await pool.query(
    `SELECT id, ref, discord_thread_id, created_at FROM cases WHERE discord_thread_id IS NOT NULL ORDER BY id`,
  );
  console.log(`Fetched ${rows.length} cases ที่มี discord_thread_id, checking...`);

  const toFix = [];
  for (const r of rows) {
    let correct;
    try {
      correct = createdAtOf(r.discord_thread_id);
    } catch {
      console.error(`  [skip] ${r.ref}: discord_thread_id ถอดไม่ได้ (${r.discord_thread_id})`);
      continue;
    }
    const diffMs = Math.abs(new Date(r.created_at).getTime() - correct.getTime());
    if (diffMs > ONE_HOUR_MS) toFix.push({ ...r, correct, diffMs });
  }

  console.log(`ต้องแก้ ${toFix.length}/${rows.length} ใบ (ต่างกัน >1 ชม.)`);
  for (const c of toFix) {
    const diffDays = (c.diffMs / (24 * ONE_HOUR_MS)).toFixed(1);
    console.log(`  ${c.ref}  ${new Date(c.created_at).toISOString().slice(0, 10)} → ${c.correct.toISOString().slice(0, 10)}  (ต่าง ${diffDays} วัน)`);
  }

  if (DRY_RUN || !toFix.length) {
    await pool.end();
    return;
  }

  let done = 0, errs = 0;
  for (const c of toFix) {
    try {
      await pool.query(`UPDATE cases SET created_at = $2 WHERE id = $1`, [c.id, c.correct]);
      done++;
      process.stdout.write(`\r  ${done}/${toFix.length}`);
    } catch (e) {
      errs++;
      console.error(`\n  [err] ${c.ref}:`, e.message);
    }
  }
  console.log(`\nDone: ${done} updated, ${errs} errors`);

  await pool.end();
})();
