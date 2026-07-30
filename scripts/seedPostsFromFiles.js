// seed โพสต์จากไฟล์ร่างใน posts/ → ตาราง post_episodes (ของโมดูล posts บนเว็บ)
//
// รูปแบบไฟล์ series: บล็อกคั่นด้วยบรรทัดขีดยาว แล้วหัวเรื่อง "A1/3 — ชื่อตอน" แล้วเนื้อหา
//   บรรทัด 📸 (ภาพประกอบ) + ✏️ (แคปชันสั้น) = โน้ตงาน ไม่ใช่ตัวโพสต์ → เก็บลง source_idea
//   ที่เหลือ = body (คัดลอกลง Facebook ได้ตรงๆ)
//
// รัน:  node scripts/seedPostsFromFiles.js --dry     (ดูผลก่อน ไม่แตะ DB)
//       node scripts/seedPostsFromFiles.js           (เขียนจริง — มีอยู่แล้วจะอัปเดตทับตาม title)
const fs = require('fs');
const path = require('path');
const pool = require('../db/index');

const ROOT = path.join(__dirname, '..');
const ORG_ID = Number(process.env.SEED_ORG_ID || 1);
const OWNER_USER_ID = Number(process.env.SEED_OWNER_USER_ID || 1);
const DRY = process.argv.includes('--dry');

// ไฟล์ series → ชื่อหมวด (post_episodes.category — ไม่มีตาราง lookup หมวดคือสตริงที่พิมพ์ไว้)
const SERIES = [
  ['posts/series-a-comeback.md',      'A เกริ่นเรื่อง'],
  ['posts/series-b-web-features.md',  'B ฟีเจอร์ฝั่งเว็บ'],
  ['posts/series-c-bot-features.md',  'C ฟีเจอร์ฝั่งบอท'],
  ['posts/series-d-mass-party.md',    'D พรรคมวลชน'],
  ['posts/series-e-compensation.md',  'E ค่าตอบแทน'],
];

const DIVIDER = /^[—–-]{6,}\s*$/;      // บรรทัดขีดคั่นบล็อก
const HEADING = /^[A-Z]\d+\/\d+\s*—/;  // "A1/3 — หายไปไหนมา"

/** แยกไฟล์ series เป็นตอนๆ → [{ title, sourceIdea, body }] */
function parseSeries(text) {
  const chunks = text.split('\n').reduce((acc, line) => {
    if (DIVIDER.test(line)) acc.push([]);
    else acc[acc.length - 1].push(line);
    return acc;
  }, [[]]).map(lines => lines.join('\n').trim());

  const episodes = [];
  for (let i = 0; i < chunks.length; i++) {
    if (!HEADING.test(chunks[i])) continue;          // ไม่ใช่หัวเรื่องตอน (เช่น หมายเหตุหัวไฟล์)
    const title = chunks[i].split('\n')[0].trim();
    const rest = (chunks[i + 1] || '').split('\n');
    const notes = [], body = [];
    for (const line of rest) (line.startsWith('📸') || line.startsWith('✏️') ? notes : body).push(line);
    episodes.push({ title, sourceIdea: notes.join('\n').trim() || null, body: body.join('\n').trim() });
    i++;                                              // ข้ามบล็อกเนื้อหาที่กินไปแล้ว
  }
  return episodes;
}

async function upsert(ep, category) {
  const { rows: found } = await pool.query(
    `SELECT id, title, body FROM post_episodes WHERE org_id = $1 AND owner_user_id = $2 AND title = $3 LIMIT 1`,
    [ORG_ID, OWNER_USER_ID, ep.title]
  );

  if (found[0]) {
    if (found[0].body === ep.body) return 'skip';     // เนื้อหาเดิม ไม่ต้องเขียน revision ซ้ำ
    // ⚠️ เก็บ "ของเดิม" เป็น revision ก่อนทับ — ถ้าคนแก้ในเว็บไปแล้วจะได้ไม่หายถาวร
    //    (เดิมเขียนของใหม่ลง revision ซึ่งไม่ช่วยอะไรเลย — ฉบับที่ถูกทับหายไปจริง 1 ครั้ง 2026-07-30)
    await pool.query(
      `INSERT INTO post_revisions (episode_id, title, body, edited_by_user_id) VALUES ($1, $2, $3, $4)`,
      [found[0].id, found[0].title, found[0].body, OWNER_USER_ID]
    );
    await pool.query(
      `UPDATE post_episodes SET body = $2, source_idea = $3, category = $4, updated_at = now() WHERE id = $1`,
      [found[0].id, ep.body, ep.sourceIdea, category]
    );
    return 'update';
  }

  // สร้างใหม่ + snapshot แรก (เหมือน createPost() ฝั่งเว็บ)
  const { rows } = await pool.query(
    `INSERT INTO post_episodes
       (org_id, owner_user_id, visibility, category, title, body, format, source_idea, created_via, status, last_edited_by)
     VALUES ($1, $2, 'personal', $3, $4, $5, 'text', $6, 'manual', 'draft', $2)
     RETURNING id`,
    [ORG_ID, OWNER_USER_ID, category, ep.title, ep.body, ep.sourceIdea]
  );
  await pool.query(
    `INSERT INTO post_revisions (episode_id, title, body, edited_by_user_id) VALUES ($1, $2, $3, $4)`,
    [rows[0].id, ep.title, ep.body, OWNER_USER_ID]
  );
  return 'insert';
}

(async () => {
  const tally = { insert: 0, update: 0, skip: 0 };
  for (const [file, category] of SERIES) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) { console.log(`⚠️  ไม่พบไฟล์ ${file} — ข้าม`); continue; }

    const episodes = parseSeries(fs.readFileSync(full, 'utf8'));
    console.log(`\n${file} → หมวด "${category}" (${episodes.length} ตอน)`);
    for (const ep of episodes) {
      if (DRY) {
        console.log(`  · ${ep.title}  [body ${ep.body.length} ตัวอักษร, โน้ต ${ep.sourceIdea ? 'มี' : 'ไม่มี'}]`);
        continue;
      }
      const action = await upsert(ep, category);
      tally[action]++;
      console.log(`  ${{ insert: '➕', update: '✏️ ', skip: '=' }[action]} ${ep.title}`);
    }
  }
  if (!DRY) console.log(`\nDone: เพิ่ม ${tally.insert}, อัปเดต ${tally.update}, เหมือนเดิม ${tally.skip}`);
  await pool.end();
})().catch(err => { console.error(err); process.exit(1); });
