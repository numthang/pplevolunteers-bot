// scripts/seedAiModes.js
// Seed dc_ai_modes (guild_id='global') จากค่า default ใน config/aiModes.js
// idempotent — มีอยู่แล้วจะ skip (ON CONFLICT DO NOTHING) ไม่ทับ prompt ที่แก้ไว้ในเว็บ
// รัน: node scripts/seedAiModes.js   (prod: sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/seedAiModes.js')

const pool = require('../db/index');
const { AI_MODES } = require('../config/aiModes');

async function main() {
  console.log(`Seeding ${AI_MODES.length} AI modes (guild_id='global')...`);
  let inserted = 0, skipped = 0;
  for (let i = 0; i < AI_MODES.length; i++) {
    const m = AI_MODES[i];
    const { rowCount } = await pool.query(
      `INSERT INTO dc_ai_modes (guild_id, value, label, prompt, sort_order, enabled)
       VALUES ('global', $1, $2, $3, $4, TRUE)
       ON CONFLICT (guild_id, value) DO NOTHING`,
      [m.value, m.label, m.prompt, i + 1]
    );
    if (rowCount > 0) { inserted++; console.log(`  + ${m.value} (${m.label})`); }
    else { skipped++; console.log(`  · ${m.value} — มีอยู่แล้ว ข้าม`); }
  }
  console.log(`Done: ${inserted} inserted, ${skipped} skipped`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
