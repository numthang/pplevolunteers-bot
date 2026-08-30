/**
 * resetCaseTimelines.js — ถอย "คั่นหน้า" การ sync timeline ของเคส แล้วล้างสรุปที่ AI เคยทำไว้
 *
 * ทำไมต้องมี: backfillCaseThreads.js ปัก `cases.last_synced_message_id` ไว้ที่ข้อความล่าสุด
 * **ทุกใบเสมอ** (บรรทัด 350-351) ส่วนการยิง AI อยู่ใต้ `--ai` ซึ่งค่าตั้งต้นคือไม่ยิง
 * ผลคือเคสส่วนใหญ่ "ถูกทำเครื่องหมายว่า sync ครบแล้ว" ทั้งที่ไม่เคยมี timeline สักบรรทัด
 * → กดปุ่ม "ดึง Discord ใหม่" ในเว็บได้ 0 ข้อความ แล้วเงียบไปเฉยๆ
 *
 * สคริปต์นี้เซ็ต watermark กลับเป็น NULL = "ยังไม่เคยอ่าน" → กดปุ่มในเว็บแล้วสกัดใหม่ตั้งแต่ต้นเธรด
 *
 * Usage (local):
 *   node scripts/data/resetCaseTimelines.js                 ← DRY RUN (ค่าตั้งต้น ไม่เขียนอะไร)
 *   node scripts/data/resetCaseTimelines.js --commit        ← รันจริง
 *   node scripts/data/resetCaseTimelines.js --ref 70-69-2937 --commit   ← เคสเดียว
 *
 * Usage (prod) — ต้อง `sudo -u www` เสมอ ไม่งั้น environment file ไม่โหลด:
 *   sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && \
 *     node scripts/data/resetCaseTimelines.js'
 *
 * ต่างจาก backfillCaseThreads.js: **ที่นี่ค่าตั้งต้นคือ DRY RUN** เพราะสคริปต์นี้ DELETE จริง
 * (ตัวโน้น INSERT อย่างเดียวเลยสั่งเปล่าๆ ได้) — dry-run ใช้เงื่อนไขชุดเดียวกับตอน --commit เป๊ะ
 * ต่างกันแค่บรรทัดที่เขียน DB เท่านั้น
 *
 * Options:
 *   --commit        เขียนจริง (ไม่ใส่ = แค่นับให้ดู)
 *   --ref <ref>     ทำเฉพาะเคสนี้ (ไม่ใส่ = ทุกเคสที่มีเธรด Discord)
 *
 * ลบเฉพาะ `case_timeline.source = 'ai'`
 *   **ไม่แตะ** `source = 'human'` (คนพิมพ์เอง) และ `'note'` — ของพวกนั้นสร้างใหม่ไม่ได้
 * **ไม่แตะ `last_attachment_message_id`** — ไฟล์แนบเป็น watermark คนละเส้น
 *   และ importThreadAttachments() มี unique index กันซ้ำอยู่แล้ว ไม่ต้อง reset ตาม
 * กดปุ่มในเว็บทีละเคสเอง — สคริปต์นี้ไม่ยิง AI และไม่แตะ Discord เลย (อ่าน/เขียน DB อย่างเดียว)
 */
require('dotenv').config();
const pool = require('../../db/index');

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const REF = args.includes('--ref') ? args[args.indexOf('--ref') + 1] || null : null;

(async () => {
  // เงื่อนไขชุดเดียว ใช้ทั้ง dry-run และ --commit — ห้ามแยกกัน ไม่งั้นตัวเลขที่ preview ไม่ใช่ของที่รันจริง
  const where = REF ? 'discord_thread_id IS NOT NULL AND ref = $1' : 'discord_thread_id IS NOT NULL';
  const params = REF ? [REF] : [];

  const { rows: [scope] } = await pool.query(
    `SELECT COUNT(*) AS cases,
            COUNT(*) FILTER (WHERE last_synced_message_id IS NOT NULL) AS with_watermark
       FROM cases WHERE ${where}`, params);

  const { rows: [tl] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE source = 'ai')  AS ai_rows,
            COUNT(*) FILTER (WHERE source <> 'ai') AS keep_rows
       FROM case_timeline
      WHERE case_id IN (SELECT id FROM cases WHERE ${where})`, params);

  console.log(`\n=== ${COMMIT ? 'RUN จริง' : 'DRY RUN (ไม่เขียนอะไร)'} ===`);
  console.log(REF ? `ขอบเขต: เคส ref = ${REF}` : 'ขอบเขต: ทุกเคสที่มีเธรด Discord');
  console.log(`  เคสในขอบเขต       : ${scope.cases}`);
  console.log(`  จะถอย watermark   : ${scope.with_watermark} ใบ  (last_synced_message_id → NULL)`);
  console.log(`  จะลบ timeline AI  : ${tl.ai_rows} แถว`);
  console.log(`  เก็บไว้ไม่แตะ      : ${tl.keep_rows} แถว (human/note)`);

  if (!COMMIT) {
    console.log('\nยังไม่ได้เขียนอะไร — ใส่ --commit เพื่อรันจริง\n');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query(
      `DELETE FROM case_timeline
        WHERE source = 'ai'
          AND case_id IN (SELECT id FROM cases WHERE ${where})`, params);
    const upd = await client.query(
      `UPDATE cases SET last_synced_message_id = NULL
        WHERE ${where} AND last_synced_message_id IS NOT NULL`, params);
    await client.query('COMMIT');
    console.log(`\nDone: ลบ timeline AI ${del.rowCount} แถว · ถอย watermark ${upd.rowCount} ใบ`);
    console.log('ขั้นต่อไป: เข้าหน้าเคสแล้วกด "↻ ดึง Discord ใหม่" ทีละใบ\n');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nล้มเหลว — rollback แล้ว ไม่มีอะไรเปลี่ยน:', e.message, '\n');
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
