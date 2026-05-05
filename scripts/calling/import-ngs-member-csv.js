/**
 * import-ngs-member-csv.js
 * Parse CSV → generate SQL for review before import (province-by-province safe)
 *
 * Usage:
 *   node scripts/calling/import-ngs-member-csv.js <file.csv> <province_name>
 *
 * Example:
 *   node scripts/calling/import-ngs-member-csv.js ngs_member_นครปฐม.csv "นครปฐม"
 *   node scripts/calling/import-ngs-member-csv.js ngs_member_ราชบุรี.csv "ราชบุรี"
 *
 * Output:
 *   backups/calling/ngs-import-<province>-<timestamp>.sql
 *
 * Note: Uses ON DUPLICATE KEY UPDATE → safe to run multiple times (upsert)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

// ─── Args ──────────────────────────────────────────────────────────────────

const CSV_FILE = process.argv[2];
const PROVINCE_NAME = process.argv[3];

if (!CSV_FILE || !PROVINCE_NAME) {
  console.error('Usage: node import-ngs-member-csv.js <file.csv> <province_name>');
  console.error('Example: node import-ngs-member-csv.js ngs_member_นครปฐม.csv "นครปฐม"');
  process.exit(1);
}

// CSV column index map (0-based)
const C = {
  id:                                       0,
  title:                                    1,
  first_name:                               2,
  last_name:                                3,
  full_name:                                4,
  old_full_name:                            5,
  created_at:                               6,
  ect_register_date:                        7,
  expired_at:                               8,
  law_expired_at:                           9,
  gender:                                   10,
  serial:                                   11,
  race:                                     12,
  was_born_in_thai_nationality:             13,
  date_of_birth:                            14,
  register_home_address_id:                 15,
  home_house_number:                        16,
  home_house_group_number:                  17,
  home_village:                             18,
  home_alley:                               19,
  home_road:                                20,
  home_district:                            21,
  home_constituency:                        22,
  home_amphure:                             23,
  home_province:                            24,
  home_zip_code:                            25,
  home_province_id:                         26,
  identification_number:                    27,
  membership_type:                          28,
  card_type:                                29,
  mobile_number:                            30,
  created_by:                               31,
  latest_state:                             32,
  latest_card_state:                        33,
  latest_ect_state:                         34,
  approved_at:                              35,
  approved_by:                              36,
  latest_province_state:                    37,
  province_document_approved_at:            38,
  province_document_approved_by:            39,
  province_document_rejected_at:            40,
  province_document_rejected_by:            41,
  email:                                    42,
  facebook_id:                              43,
  facebook_group_joined:                    44,
  line_id:                                  45,
  line_group_joined:                        46,
  house_number:                             47,
  house_group_number:                       48,
  village:                                  49,
  alley:                                    50,
  road:                                     51,
  district:                                 52,
  amphure:                                  53,
  province:                                 54,
  zip_code:                                 55,
  address:                                  56,
  address_complement:                       57,
  city:                                     58,
  state:                                    59,
  country:                                  60,
  current_job:                              61,
  job_position:                             62,
  company:                                  63,
  job_experience:                           64,
  network:                                  65,
  network_description:                      66,
  has_registered_any_political_position:    67,
  has_took_any_political_position:          68,
  card_delivery_method:                     69,
  card_delivery_address:                    70,
  property_question_one:                    71,
  property_question_two:                    72,
  property_question_two_political_party_name: 73,
  is_privacy_accepted:                      74,
  order_id:                                 75,
  receipt_book:                             76,
  receipt_number:                           77,
  payment_status:                           78,
  payment_type:                             79,
  amount:                                   80,
  description:                              81,
  paid_at:                                  82,
  first_approved_payment_at:                83,
  ect_state:                                84,
  ect_remark:                               85,
  ect_description:                          86,
  registration_method:                      87,
  renew_at:                                 88,
};

const DB_COLS = Object.keys(C).filter(k => C[k] !== undefined).sort((a, b) => C[a] - C[b]);
const UPDATE_COLS = DB_COLS.filter(c => c !== 'source_id');

// ─── Helpers ───────────────────────────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  return `'${String(val)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n')}'`;
}

function parseDate(str) {
  if (!str || str === 'NULL' || str.trim() === '') return null;
  // Assume YYYY-MM-DD or similar format
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

function parseDecimal(str) {
  if (!str || str.trim() === '') return null;
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function parseTrim(str) {
  return str ? String(str).trim() : '';
}

// ─── Parse CSV ─────────────────────────────────────────────────────────────

async function parseCSV(csvPath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const stream = fs.createReadStream(csvPath);
    const parser = parse({
      relax_column_count: true,
      relax_quotes: true,
    });

    let isHeader = true;

    parser.on('readable', function() {
      let record;
      while ((record = parser.read()) !== null) {
        if (isHeader) {
          isHeader = false;
          continue; // skip header
        }
        rows.push(record);
      }
    });

    parser.on('error', reject);
    parser.on('end', () => resolve(rows));

    stream.pipe(parser);
  });
}

function rowToValues(f) {
  const obj = {};
  for (const [key, idx] of Object.entries(C)) {
    if (idx === undefined) continue;
    const val = f[idx];
    if (!val || val.trim() === '') {
      obj[key] = null;
    } else if (key.includes('_at') || key.includes('_date')) {
      obj[key] = parseDate(val);
    } else if (key === 'amount') {
      obj[key] = parseDecimal(val);
    } else {
      obj[key] = parseTrim(val);
    }
  }
  return obj;
}

// ─── Generate SQL ─────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`File not found: ${CSV_FILE}`);
    process.exit(1);
  }

  process.stderr.write(`Reading CSV: ${CSV_FILE}\n`);
  const rows = await parseCSV(CSV_FILE);
  process.stderr.write(`  → ${rows.length} members\n`);

  if (rows.length === 0) {
    console.error('No members found in CSV');
    process.exit(1);
  }

  // ── Generate SQL ──
  const lines = [];

  lines.push('-- ============================================================');
  lines.push(`-- NGS Member Cache Import — ${PROVINCE_NAME}`);
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Members: ${rows.length}`);
  lines.push('-- Mode: UPSERT (ON DUPLICATE KEY UPDATE)');
  lines.push('-- Safe to re-run: existing members are updated, not deleted');
  lines.push('-- ============================================================');
  lines.push('');
  lines.push('SET NAMES utf8mb4;');
  lines.push('SET foreign_key_checks = 0;');
  lines.push('');

  lines.push(`-- ─── ngs_member_cache (${rows.length}) ─────────────────────────────────────`);
  lines.push(`INSERT INTO ngs_member_cache (${DB_COLS.join(', ')})`);
  lines.push('VALUES');

  const valueLines = [];
  for (let i = 0; i < rows.length; i++) {
    const f = rows[i];
    const vals = rowToValues(f);

    const valuesStr = DB_COLS.map(col => {
      const v = vals[col];
      if (v === null) return 'NULL';
      if (typeof v === 'number') return String(v);
      return esc(v);
    }).join(', ');

    valueLines.push(`  (${valuesStr})`);
  }

  lines.push(valueLines.join(',\n'));
  lines.push('ON DUPLICATE KEY UPDATE');
  lines.push(UPDATE_COLS.map(col => `  ${col} = VALUES(${col})`).join(',\n'));
  lines.push(`, synced_at = CURRENT_TIMESTAMP;`);
  lines.push('');

  lines.push('SET foreign_key_checks = 1;');
  lines.push('');
  lines.push('-- Done.');

  const sql = lines.join('\n');

  // ── Save SQL ──
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = path.join(__dirname, `../../backups/calling/ngs-import-${PROVINCE_NAME}-${ts}.sql`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, sql, 'utf8');

  process.stderr.write(`\nSQL written to: ${out}\n`);
  process.stderr.write('Review SQL then import:\n');
  process.stderr.write(`  mysql pple_volunteers < ${out}\n`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
