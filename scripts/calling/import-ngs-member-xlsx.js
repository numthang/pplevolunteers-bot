/**
 * import-ngs-member-xlsx.js
 * Parse calling log XLSX → generate SQL for partial ngs_member_cache (name, province, phone only)
 *
 * Usage:
 *   node scripts/calling/import-ngs-member-xlsx.js <file.xlsx> <province_name>
 *
 * Example:
 *   node scripts/calling/import-ngs-member-xlsx.js calling_log_นครปฐม.xlsx "นครปฐม"
 *   node scripts/calling/import-ngs-member-xlsx.js calling_log_ราชบุรี.xlsx "ราชบุรี"
 *
 * Inserts into: ngs_member_cache (source_id, first_name, last_name, home_province, home_amphure, home_district, mobile_number)
 * Other columns: NULL (partial import until full CSV available)
 *
 * Output:
 *   backups/calling/ngs-import-<province>-<timestamp>.sql
 *
 * Note: Uses ON DUPLICATE KEY UPDATE → safe upsert (can re-run multiple times)
 */

'use strict';

const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

// ─── Args ──────────────────────────────────────────────────────────────────

const XLS_FILE = process.argv[2];
const PROVINCE_NAME = process.argv[3];

if (!XLS_FILE || !PROVINCE_NAME) {
  console.error('Usage: node import-ngs-member-xlsx.js <file.xlsx> <province_name>');
  console.error('Example: node import-ngs-member-xlsx.js calling_log_นครปฐม.xlsx "นครปฐม"');
  process.exit(1);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  return `'${String(val)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n')}'`;
}

function extractSourceId(cell) {
  if (!cell) return null;
  const url = cell.l?.Target ?? cell.f ?? '';
  const m   = String(url).match(/\/memberships\/(\d+)/);
  return m ? parseInt(m[1]) : null;
}

// ─── Parse all district sheets ─────────────────────────────────────────────

function parseMembers(wb) {
  const members = new Map(); // source_id → member data
  const SKIP_SHEETS = new Set(['อ่านก่อนโทร', 'latest']);

  for (const sheetName of wb.SheetNames) {
    if (SKIP_SHEETS.has(sheetName)) continue;

    const ws   = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    const h1 = (data[0] ?? []).map(v => (v == null ? null : String(v).trim()));
    const h2 = (data[1] ?? []).map(v => (v == null ? null : String(v).trim()));

    // Find รายละเอียด column
    let detailCol = h1.findIndex(v => v === 'รายละเอียด');
    if (detailCol < 0) detailCol = h2.findIndex(v => v === 'รายละเอียด');
    if (detailCol < 0) continue;

    process.stderr.write(`  ${sheetName}: parsing members...\n`);

    // Column indices (from header row 1)
    const colMap = {
      prefix:  h1.findIndex(v => v === 'คำนำหน้า'),      // col B
      fname:   h1.findIndex(v => v === 'ชื่อ'),           // col C
      lname:   h1.findIndex(v => v === 'สมาชิก'),         // col D (actually membership type, use as last name)
      amphure: h1.findIndex(v => v === 'อำเภอ'),          // col E
      tambon:  h1.findIndex(v => v === 'ตำบล'),           // col F
      phone:   h1.findIndex(v => v === 'เบอร์ติดต่อ'),    // col H
    };

    for (let ri = 2; ri < data.length; ri++) {
      const row = data[ri];

      // Extract source_id from hyperlink
      const cellRef  = XLSX.utils.encode_cell({ r: ri, c: detailCol });
      const sourceId = extractSourceId(ws[cellRef]);
      if (!sourceId) continue;

      // Skip if already seen (use first occurrence)
      if (members.has(sourceId)) continue;

      // Extract basic fields
      const firstName = colMap.fname >= 0 ? String(row[colMap.fname] ?? '').trim() : '';
      const lastName  = colMap.lname >= 0 ? String(row[colMap.lname] ?? '').trim() : '';
      const amphure   = colMap.amphure >= 0 ? String(row[colMap.amphure] ?? '').trim() : '';
      const tambon    = colMap.tambon >= 0 ? String(row[colMap.tambon] ?? '').trim() : '';
      const phone     = colMap.phone >= 0 ? String(row[colMap.phone] ?? '').trim() : '';

      // Province is always the sheet name
      const province = sheetName;

      // Ensure first_name and last_name are not empty (required fields)
      if (!firstName && !lastName) continue;

      members.set(sourceId, {
        source_id: sourceId,
        first_name: firstName || 'N/A',
        last_name:  lastName || 'N/A',
        home_province: province,
        home_amphure: amphure || null,
        home_district: tambon || null,
        mobile_number: phone || null,
      });
    }
  }

  return members;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(XLS_FILE)) {
    console.error(`File not found: ${XLS_FILE}`);
    process.exit(1);
  }

  process.stderr.write(`Reading: ${XLS_FILE}\n`);
  const wb = XLSX.readFile(XLS_FILE);

  process.stderr.write('Parsing members...\n');
  const members = parseMembers(wb);
  process.stderr.write(`  → ${members.size} unique members found\n`);

  if (members.size === 0) {
    console.error('No members found to import');
    process.exit(1);
  }

  // ── Generate SQL ──
  const lines = [];

  lines.push('-- ============================================================');
  lines.push(`-- NGS Member Cache Import (Partial) — ${PROVINCE_NAME}`);
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Members: ${members.size}`);
  lines.push('-- Mode: UPSERT (ON DUPLICATE KEY UPDATE)');
  lines.push('-- Source: calling log XLSX (name, province, phone only)');
  lines.push('-- Safe to re-run: existing members are updated, not deleted');
  lines.push('-- ============================================================');
  lines.push('');
  lines.push('SET NAMES utf8mb4;');
  lines.push('SET foreign_key_checks = 0;');
  lines.push('');

  const memberArray = Array.from(members.values());
  lines.push(`-- ─── ngs_member_cache (${memberArray.length}) ─────────────────────────────────────`);
  lines.push('INSERT INTO ngs_member_cache (');
  lines.push('  source_id, first_name, last_name, home_province, home_amphure, home_district, mobile_number');
  lines.push(')');
  lines.push('VALUES');

  const valueLines = memberArray.map(m =>
    `  (${m.source_id}, ${esc(m.first_name)}, ${esc(m.last_name)}, ` +
    `${esc(m.home_province)}, ${esc(m.home_amphure)}, ${esc(m.home_district)}, ` +
    `${esc(m.mobile_number)})`
  );

  lines.push(valueLines.join(',\n'));
  lines.push('ON DUPLICATE KEY UPDATE');
  lines.push('  first_name = VALUES(first_name),');
  lines.push('  last_name = VALUES(last_name),');
  lines.push('  home_province = VALUES(home_province),');
  lines.push('  home_amphure = VALUES(home_amphure),');
  lines.push('  home_district = VALUES(home_district),');
  lines.push('  mobile_number = VALUES(mobile_number),');
  lines.push('  synced_at = CURRENT_TIMESTAMP;');
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

main();
