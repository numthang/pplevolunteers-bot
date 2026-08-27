// one-off: ล้างผลของ backfillPostThreads รอบวันนี้บน dev เพื่อรันใหม่
require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const pool = require('./db/index');

const GO = process.argv.includes('--yes');
const REPO_ROOT = process.cwd();

(async () => {
  // ชุดเป้าหมาย: โพสต์ที่ backfill สร้างวันนี้ (มี channel_id = มาจากกระทู้)
  const TARGET = `SELECT id FROM post_episodes
                   WHERE created_at::date = current_date AND channel_id IS NOT NULL`;

  const { rows: posts } = await pool.query(TARGET);
  const { rows: media } = await pool.query(
    `SELECT m.path FROM post_episode_media m
      WHERE m.episode_id IN (${TARGET}) AND m.path IS NOT NULL`);
  const { rows: cards } = await pool.query(
    `SELECT l.card_id FROM kanban_card_links l
      WHERE l.entity_type = 'post' AND l.entity_id IN (${TARGET})`);

  console.log(`จะลบ: โพสต์ ${posts.length} · การ์ด ${cards.length} · ไฟล์รูป ${media.length}`);
  if (!GO) { console.log('DRY RUN — ใส่ --yes เพื่อลบจริง'); return pool.end(); }

  // 1) การ์ดก่อน (cascade เก็บ links/helpers/checklist/field values ให้เอง)
  if (cards.length) {
    await pool.query(`DELETE FROM kanban_cards WHERE id = ANY($1::bigint[])`,
      [cards.map(c => c.card_id)]);
  }
  // 2) โพสต์ (cascade เก็บ revisions/media/comments ให้เอง)
  const { rowCount } = await pool.query(
    `DELETE FROM post_episodes WHERE created_at::date = current_date AND channel_id IS NOT NULL`);

  // 3) ไฟล์บนดิสก์ — กัน path traversal: ต้องอยู่ใต้ storage/posts เท่านั้น
  let filesGone = 0, bytes = 0;
  const base = path.resolve(REPO_ROOT, 'storage', 'posts');
  for (const m of media) {
    const abs = path.resolve(REPO_ROOT, m.path);
    if (abs !== base && !abs.startsWith(base + path.sep)) continue;
    try {
      bytes += (await fs.stat(abs)).size;
      await fs.unlink(abs);
      filesGone++;
    } catch { /* ไม่มีไฟล์ = ไม่เป็นไร */ }
  }
  console.log(`ลบแล้ว: โพสต์ ${rowCount} · การ์ด ${cards.length} · ไฟล์ ${filesGone} (${(bytes/1048576).toFixed(0)} MB)`);
  await pool.end();
})();
