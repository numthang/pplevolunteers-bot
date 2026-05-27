/**
 * 2026-05-27: Migrate social app credentials from .env → dc_guild_config (multi-tenant)
 *
 * What it does:
 *   1. Loop every guild in dc_guilds
 *   2. For each guild, insert (META_APP_ID, META_APP_SECRET, X_CONSUMER_KEY, X_CONSUMER_SECRET)
 *      into dc_guild_config — same env values for all guilds (single-tenant seed)
 *   3. Strip api_key/api_secret out of access_token JSON for all platform='x' rows
 *      → keep only { access_token, access_token_secret }
 *
 * Usage:
 *   PROD: sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/migration/seed-social-app-creds.js'
 *   DEV:  node scripts/migration/seed-social-app-creds.js
 *
 * Safe to re-run: ON DUPLICATE KEY UPDATE for config, idempotent JSON re-strip
 */

require('dotenv').config();
const pool = require('../../db/index');

const CREDS = {
  meta_app_id:       process.env.META_APP_ID,
  meta_app_secret:   process.env.META_APP_SECRET,
  x_consumer_key:    process.env.X_CONSUMER_KEY,
  x_consumer_secret: process.env.X_CONSUMER_SECRET,
};

async function main() {
  for (const [k, v] of Object.entries(CREDS)) {
    if (!v) { console.error(`❌ env ${k.toUpperCase()} ว่าง — กรอกใน .env ก่อนรัน`); process.exit(1); }
  }

  // 1. seed dc_guild_config for every existing guild
  const [guilds] = await pool.execute('SELECT guild_id, name FROM dc_guilds');
  console.log(`พบ ${guilds.length} guild ใน dc_guilds`);

  let seeded = 0;
  for (const g of guilds) {
    for (const [key, value] of Object.entries(CREDS)) {
      await pool.execute(
        'INSERT INTO dc_guild_config (guild_id, `key`, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
        [g.guild_id, key, value]
      );
    }
    seeded++;
    console.log(`  ✓ ${g.name || g.guild_id} — seeded 4 keys`);
  }
  console.log(`Done seeding: ${seeded} guilds × 4 keys = ${seeded * 4} rows`);

  // 2. strip api_key/api_secret out of X access_token JSON
  const [xRows] = await pool.execute(
    "SELECT id, access_token FROM dc_social_accounts WHERE platform = 'x'"
  );
  console.log(`\nพบ ${xRows.length} X account ใน dc_social_accounts`);

  let stripped = 0, skipped = 0;
  for (const r of xRows) {
    let creds;
    try { creds = JSON.parse(r.access_token); } catch { skipped++; continue; }
    if (!creds.access_token || !creds.access_token_secret) { skipped++; continue; }

    const clean = JSON.stringify({
      access_token:        creds.access_token,
      access_token_secret: creds.access_token_secret,
    });
    if (clean === r.access_token) { skipped++; continue; } // already clean

    await pool.execute(
      'UPDATE dc_social_accounts SET access_token = ? WHERE id = ?',
      [clean, r.id]
    );
    stripped++;
  }
  console.log(`Done stripping: ${stripped} stripped, ${skipped} skipped (already clean / invalid)`);

  await pool.end();
  console.log('\n✅ Migration เสร็จสมบูรณ์');
}

main().catch(err => { console.error(err); process.exit(1); });
