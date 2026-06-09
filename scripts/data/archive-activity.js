// scripts/archive-activity.js
// ย้าย dc_activity_daily และ dc_activity_mentions ที่เก่าเกิน 1 ปีไปเก็บใน archive schema
//
// Usage:
//   sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/archive-activity.js'

require('dotenv').config();
const pool = require('../../db/index');

async function archiveTable(client, { table, dateCol }) {
  const { rows: [{ cnt }] } = await client.query(
    `SELECT COUNT(*) AS cnt FROM ${table} WHERE ${dateCol} < NOW() - INTERVAL '1 year'`
  );
  const total = Number(cnt);

  if (total === 0) {
    console.log(`  ${table}: ไม่มีข้อมูลเก่าเกิน 1 ปี — ข้าม`);
    return;
  }

  console.log(`  ${table}: พบ ${total.toLocaleString()} rows จะ archive...`);

  await client.query('BEGIN');
  const { rowCount: inserted } = await client.query(
    `INSERT INTO archive.${table}
     SELECT * FROM ${table}
     WHERE ${dateCol} < NOW() - INTERVAL '1 year'
     ON CONFLICT DO NOTHING`
  );
  const { rowCount: deleted } = await client.query(
    `DELETE FROM ${table} WHERE ${dateCol} < NOW() - INTERVAL '1 year'`
  );
  await client.query('COMMIT');

  console.log(`  ${table}: archived ${inserted.toLocaleString()}, deleted ${deleted.toLocaleString()} ✓`);
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('Archive dc_activity_* rows เก่าเกิน 1 ปี\n');

    await archiveTable(client, { table: 'dc_activity_daily',    dateCol: 'date' });
    await archiveTable(client, { table: 'dc_activity_mentions', dateCol: 'timestamp' });

    console.log('\nเสร็จครับ');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
