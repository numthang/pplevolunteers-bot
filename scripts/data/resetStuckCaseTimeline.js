/**
 * กู้เคสที่ timeline "ตันถาวร" — รีเซ็ต watermark ให้ปุ่มดึง Discord บนเว็บทำงานได้อีกครั้ง
 *
 * ปัญหาที่มาแก้ (bug-209 · เจอบน prod 2026-08-31 · 172 ใบ):
 *   backfillCaseThreads เวอร์ชันเก่าเซ็ต `cases.last_synced_message_id` ตั้งแต่ตอน "สร้างเคส"
 *   โดยอ่านจาก `t.last_message_id` ของ thread metadata — ทำทุกโหมด **รวมถึงโหมดที่ไม่สกัด timeline**
 *   (timeline สกัดเฉพาะ --ai) ผลคือเคสเกิดมาพร้อมสถานะ "sync ตามทันแล้ว" ทั้งที่ยังไม่เคยสกัดสักครั้ง
 *   → กดปุ่ม "ดึง Discord ใหม่" ในหน้าเคส ได้ "ไม่มีข้อความใหม่ใน Discord" ตลอดกาล กู้ตัวเองไม่ได้
 *
 * สคริปต์นี้ทำอย่างเดียว: เซ็ต `last_synced_message_id = NULL` ให้เคสที่เข้าเกณฑ์
 *   → รอบหน้าที่กดปุ่มบนเว็บ route จะดึงข้อความ**ทั้งเธรด**มาสกัดใหม่ตั้งแต่ต้น
 *
 * ⭐ เกณฑ์แคบไว้ก่อน — แตะเฉพาะใบที่ **timeline ว่างเปล่าจริงๆ** (ไม่มีสักแถว ไม่ว่า source ไหน)
 *    ใบที่มี timeline อยู่แล้วไม่แตะเลย → ไม่มีทางเกิด timeline ซ้อน และไม่มีทางทับของที่คนพิมพ์เอง
 *
 * ⚠️ ไม่ลบข้อมูลใดๆ · ไม่ยิง AI · ไม่แตะ `last_attachment_message_id` (watermark คนละเส้น ไฟล์แนบ)
 * ⚠️ ผลข้างเคียงที่ตั้งใจ: หลังรัน คนกดปุ่มดึงจะยิง AI สกัดทั้งเธรด = มีค่าใช้จ่าย AI ตามจำนวนใบที่กด
 *
 * Options:
 *   --dry-run          นับ + โชว์รายการ ไม่เขียน DB   ← รันอันนี้ก่อนเสมอ
 *   --commit           เขียนจริง (ไม่ใส่ = dry-run อัตโนมัติ)
 *   --guild <id>       จำกัด guild เดียว — เทียบกับ `cases.discord_guild_id` (ไม่ใส่ = ทุก guild)
 *   --ref <REF>        เจาะเคสเดียว เช่น --ref 70-69-850C (ไว้ลองน้ำก่อนเทหมด)
 *   --limit <n>        ทำแค่ n ใบแรก
 *
 * PRODUCTION:
 *   sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/data/resetStuckCaseTimeline.js --dry-run'
 *   sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/data/resetStuckCaseTimeline.js --commit'
 */
require('dotenv').config();
const pool = require('../../db/index.js');

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

// ไม่ใส่ --commit = ไม่เขียน · ไม่ต้องพึ่งให้จำ --dry-run
const COMMIT = has('commit');
const GUILD_FILTER = arg('guild', null);
const REF = arg('ref', null);
const LIMIT = Number(arg('limit', 0)) || 0;

async function main() {
  console.log(`โหมด: ${COMMIT ? '🔴 COMMIT (เขียน DB จริง)' : '🟢 DRY-RUN (ไม่เขียนอะไร)'}`);
  if (GUILD_FILTER) console.log(`guild: ${GUILD_FILTER}`);
  if (REF) console.log(`ref: ${REF}`);

  // เกณฑ์: ผูกเธรด + watermark เดินไปแล้ว + ไม่มี timeline สักแถว
  // ⚠️ `cases` เป็น org-scope แล้ว — ไม่มีคอลัมน์ `guild_id` · guild ของเคสอยู่ที่ `discord_guild_id`
  //    (artifact ของเธรดที่เคสนั้นผูกอยู่ ไม่ใช่ guild ที่กำลัง browse)
  const { rows } = await pool.query(
    `SELECT c.id, c.ref, c.org_id, c.discord_guild_id, c.discord_thread_id, c.last_synced_message_id,
            c.ai_summary IS NOT NULL AS has_summary, c.created_at
       FROM cases c
      WHERE c.discord_thread_id IS NOT NULL
        AND c.last_synced_message_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM case_timeline t WHERE t.case_id = c.id)
        AND ($1::varchar IS NULL OR c.discord_guild_id = $1)
        AND ($2::varchar IS NULL OR c.ref = $2)
      ORDER BY c.id`,
    [GUILD_FILTER, REF],
  );

  const targets = LIMIT ? rows.slice(0, LIMIT) : rows;
  console.log(`\nเข้าเกณฑ์ ${rows.length} ใบ${LIMIT ? ` → ทำ ${targets.length} ใบตาม --limit` : ''}`);
  if (!targets.length) { console.log('ไม่มีอะไรต้องทำ'); return; }

  console.log('\nตัวอย่าง 10 ใบแรก:');
  for (const r of targets.slice(0, 10)) {
    console.log(`  ${r.ref}  thread=${r.discord_thread_id}  wm=${r.last_synced_message_id}  ai_summary=${r.has_summary ? 'มี' : 'ไม่มี'}`);
  }

  if (!COMMIT) {
    console.log('\n🟢 DRY-RUN จบ — ไม่ได้เขียนอะไร · ใส่ --commit เพื่อรันจริง');
    return;
  }

  let done = 0, err = 0;
  for (let i = 0; i < targets.length; i++) {
    const r = targets[i];
    process.stdout.write(`\r  ${i + 1}/${targets.length} (ok:${done} err:${err})`);
    try {
      // เงื่อนไข NOT EXISTS ซ้ำอีกรอบตอนเขียน — กันเคสที่มีคนกดปุ่มดึงสำเร็จไปแล้วระหว่างสคริปต์รัน
      const res = await pool.query(
        `UPDATE cases c
            SET last_synced_message_id = NULL, updated_at = NOW()
          WHERE c.id = $1
            AND c.last_synced_message_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM case_timeline t WHERE t.case_id = c.id)`,
        [r.id],
      );
      if (res.rowCount) done++;
    } catch (e) {
      err++;
      console.error(`\n  [err] case ${r.ref}:`, e.message);
    }
  }

  console.log(`\n\nDone: รีเซ็ต ${done} ใบ, error ${err} ใบ`);
  console.log('ขั้นถัดไป: เข้าหน้าเคสในเว็บแล้วกด "ดึง Discord ใหม่" — จะสกัด timeline ทั้งเธรดใหม่ (ยิง AI)');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
