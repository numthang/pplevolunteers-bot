/**
 * import-member-csv.js
 * Import ngs_member_cache from full NGS CSV export — direct DB upsert
 *
 * Usage:
 *   node scripts/calling/import-member-csv.js <file.csv>
 *
 * Example:
 *   node scripts/calling/import-member-csv.js ngs_member_ราชบุรี.csv
 *
 * Target:  ngs_member_cache (all columns, upsert by source_id)
 * Requires: GUILD_ID env var
 */

'use strict';

require('dotenv').config();
const fs   = require('fs');
const { parse } = require('csv-parse');
const pool = require('../../db');

const CSV_FILE = process.argv[2];
if (!CSV_FILE) {
  console.error('Usage: node import-member-csv.js <file.csv>');
  process.exit(1);
}

const GUILD_ID = process.env.GUILD_ID;
if (!GUILD_ID) {
  console.error('Error: GUILD_ID env var is required');
  process.exit(1);
}

const BATCH_SIZE = 100;

// CSV header 'id' maps to DB column 'source_id'; everything else matches by name
const HEADER_REMAP = { id: 'source_id' };

const DATE_COLS = new Set([
  'created_at', 'ect_register_date', 'expired_at', 'law_expired_at',
  'date_of_birth', 'approved_at', 'province_document_approved_at',
  'province_document_rejected_at', 'paid_at', 'renew_at', 'first_approved_payment_at',
]);

const INT_COLS  = new Set(['source_id', 'is_foreigner', 'register_home_address_id',
  'home_province_id', 'province_id']);

// ─── Type coercions ─────────────────────────────────────────────────────────

function trim(val) {
  if (val == null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function parseDate(val) {
  const s = trim(val);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseInt2(val) {
  const s = trim(val);
  if (!s) return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function parseDecimal(val) {
  const s = trim(val);
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function coerce(dbCol, val) {
  if (INT_COLS.has(dbCol))    return parseInt2(val);
  if (dbCol === 'amount')     return parseDecimal(val);
  if (DATE_COLS.has(dbCol))   return parseDate(val);
  return trim(val);
}

// ─── Batch upsert ───────────────────────────────────────────────────────────

async function insertBatch(rows, dbCols) {
  if (rows.length === 0) return 0;

  const updateCols      = dbCols.filter(c => c !== 'source_id');
  const placeholders    = dbCols.map((_, i) => `$${i + 1}`).join(', ');
  const rowPlaceholders = rows.map((_, ri) =>
    `(${dbCols.map((_, ci) => `$${ri * dbCols.length + ci + 1}`).join(', ')})`
  ).join(',\n  ');
  const updates = updateCols.map(c => `${c} = EXCLUDED.${c}`).join(',\n    ');

  const sql = `
    INSERT INTO ngs_member_cache (${dbCols.join(', ')})
    VALUES
      ${rowPlaceholders}
    ON CONFLICT (source_id) DO UPDATE SET
    ${updates},
    synced_at = CURRENT_TIMESTAMP
  `;

  const values = rows.flatMap(r => dbCols.map(col => r[col] ?? null));
  const result = await pool.query(sql, values);
  return result.rowCount;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function importMembers(csvPath) {
  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  process.stderr.write(`Reading: ${csvPath}\n`);
  process.stderr.write(`Guild: ${GUILD_ID}\n`);

  let dbCols = null;  // set from first record's keys
  const stats = { total: 0, upserted: 0, invalid: 0, errors: [] };
  let batch   = [];

  async function flushBatch() {
    if (batch.length === 0) return;
    const toFlush = batch;
    batch = [];
    try {
      stats.upserted += await insertBatch(toFlush, dbCols);
    } catch (err) {
      stats.errors.push(err.message);
      process.stderr.write(`\nBatch error: ${err.message}\n`);
    }
  }

  return new Promise((resolve, reject) => {
    const parser = fs.createReadStream(csvPath).pipe(
      parse({
        columns: true,           // use header row as object keys
        skip_empty_lines: true,
        bom: true,
        relax_quotes: true,
        trim: false,
      })
    );

    parser.on('data', async (record) => {
      // Build dbCols once from header
      if (!dbCols) {
        dbCols = [
          ...Object.keys(record).map(h => HEADER_REMAP[h] ?? h),
          'guild_id',
        ];
        process.stderr.write(`  Columns detected: ${dbCols.length - 1} from CSV + guild_id\n`);
      }

      stats.total++;

      const row = { guild_id: GUILD_ID };
      for (const [csvKey, val] of Object.entries(record)) {
        const dbCol = HEADER_REMAP[csvKey] ?? csvKey;
        row[dbCol]  = coerce(dbCol, val);
      }

      if (!row.source_id) { stats.invalid++; return; }
      if (!row.first_name) { stats.invalid++; return; }

      batch.push(row);

      if (batch.length >= BATCH_SIZE) {
        parser.pause();
        await flushBatch();
        process.stdout.write(`\r  ${stats.upserted} upserted (${stats.errors.length} errors)`);
        parser.resume();
      }
    });

    parser.on('end', async () => {
      await flushBatch();
      resolve(stats);
    });

    parser.on('error', reject);
  });
}

(async () => {
  try {
    const stats = await importMembers(CSV_FILE);

    process.stdout.write('\n');
    console.log(`Done: ${stats.upserted} upserted, ${stats.invalid} invalid, ${stats.errors.length} errors`);

    if (stats.errors.length > 0) {
      stats.errors.slice(0, 10).forEach(e => console.error(`  - ${e}`));
      if (stats.errors.length > 10) console.error(`  ... and ${stats.errors.length - 10} more`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Fatal:', err.message);
    process.exit(1);
  }
})();
