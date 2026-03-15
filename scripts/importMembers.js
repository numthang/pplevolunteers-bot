// scripts/importMembers.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {parse} = require('csv-parse/sync');
const pool = require('../db/index');

async function main() {
  const csvPath = path.join(__dirname, '../backups/intro_normalized (3).csv');
  const content = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, ''); // ลบ BOM

  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`📦 พบ ${records.length} records`);

  let imported = 0;
  let failed = 0;

  for (const r of records) {
    try {
      await pool.execute(`
        INSERT INTO members
          (discord_id, username, firstname, lastname, nickname, member_id, specialty, province, interests, roles, referred_by, registered_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          username    = VALUES(username),
          firstname   = VALUES(firstname),
          lastname    = VALUES(lastname),
          nickname    = VALUES(nickname),
          member_id   = VALUES(member_id),
          specialty   = VALUES(specialty),
          province    = VALUES(province),
          interests   = VALUES(interests),
          roles       = VALUES(roles),
          referred_by = VALUES(referred_by),
          registered_at = VALUES(registered_at),
          updated_at  = CURRENT_TIMESTAMP
      `, [
        r.discord_id,
        r.username || null,
        r.firstname || null,
        r.lastname || null,
        r.nickname || null,
        r.member_id || null,
        r.specialty_raw || null,  // ← เพิ่ม
        r.province || null,
        r.interests || null,
        r.roles || null,
        r.referred_by || null,
        r.registered_at || null, 
      ]);

      imported++;
      if (imported % 100 === 0) console.log(`✅ ${imported}/${records.length}`);
    } catch (err) {
      console.error(`❌ failed: ${r.discord_id} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n🎉 เสร็จสิ้น: import ${imported} | failed ${failed}`);
  process.exit(0);
}

main();
