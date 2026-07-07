// scripts/migration/gogo-session-backfill.js
// backfill live gogo panels ให้ปุ่มใน sticky config carry session_id
//   sid = config.message_id (= session_id หลัง migration.sql backfill)
// ปุ่มบน live message เก่ายังไม่มี sid → handler มี fallback (btnSid) รองรับอยู่แล้ว
//   → repost ถัดไปจะใช้ config ที่ patch แล้ว ปุ่มถูกต้อง
// รันครั้งเดียว: sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/migration/gogo-session-backfill.js'
const pool = require('../../db/index');

const GOGO_BTN_PREFIXES = ['btn_gogo_signup', 'btn_gogo_dm', 'btn_gogo_list'];
const isGogoBtn = id => GOGO_BTN_PREFIXES.some(p => id === p || id.startsWith(p + ':'));

// เติม :sid ให้ปุ่มที่ยังไม่มี (idempotent) — คืน true ถ้ามีการแก้
function patchComponents(components, sid) {
  let changed = false;
  for (const row of components || []) {
    for (const c of row.components || []) {
      if (typeof c.custom_id !== 'string') continue;
      if (GOGO_BTN_PREFIXES.includes(c.custom_id)) {
        c.custom_id = `${c.custom_id}:${sid}`;
        changed = true;
      }
    }
  }
  return changed;
}

async function main() {
  const { rows } = await pool.query(
    `SELECT guild_id, "key", value FROM dc_guild_config WHERE "key" LIKE 'sticky_%'`
  );
  console.log(`Fetched ${rows.length} sticky configs, scanning for gogo panels...`);

  let gogo = 0, patched = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    try {
      let cfg = r.value;
      if (typeof cfg === 'string') cfg = JSON.parse(cfg);
      const comps = cfg?.components;
      // gogo panel = มีปุ่ม btn_gogo_signup
      const hasGogo = (comps || []).some(row =>
        (row.components || []).some(c => typeof c.custom_id === 'string' && isGogoBtn(c.custom_id) && c.custom_id.startsWith('btn_gogo_signup')));
      if (!hasGogo) continue;
      gogo++;

      const sid = cfg.message_id;
      if (!sid) { console.log(`  ⚠ ${r.key}: no message_id, skip`); skipped++; continue; }

      if (patchComponents(comps, sid)) {
        await pool.query(
          `UPDATE dc_guild_config SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE guild_id = $2 AND "key" = $3`,
          [JSON.stringify(cfg), r.guild_id, r.key]
        );
        patched++;
        process.stdout.write(`\r  patched ${patched} (sid=${sid})   `);
      } else {
        skipped++; // ปุ่มมี sid อยู่แล้ว
      }
    } catch (e) {
      errors++;
      console.error(`\n  ✗ ${r.key}:`, e.message);
    }
  }
  console.log(`\nDone: ${gogo} gogo panels · ${patched} patched · ${skipped} already-ok/skipped · ${errors} errors`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
