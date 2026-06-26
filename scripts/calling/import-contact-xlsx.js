/**
 * import-contact-xlsx.js
 * Parse donation contact XLSX → SQL for calling_contacts
 *
 * Usage:
 *   node scripts/calling/import-contact-xlsx.js <file.xlsx> [guild_id]
 *
 * Example:
 *   node scripts/calling/import-contact-xlsx.js backups/calling/donation_contact_ราชบุรี.xlsx
 *
 * Output:
 *   backups/calling/contact-import-<timestamp>.sql
 *
 * Expected XLSX columns (row 0 = header):
 *   ชื่อ-สกุล | เบอร์โทร | จังหวัด | อำเภอ | จำนวนครั้ง | จำนวนเงินรวม | บริจาครายเดือน | ...
 */

'use strict';

require('dotenv').config();
const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

const XLS_FILE = process.argv[2];
const GUILD_ID = process.argv[3] || process.env.GUILD_ID;

if (!XLS_FILE) {
  console.error('Usage: node import-contact-xlsx.js <file.xlsx> [guild_id]');
  process.exit(1);
}
if (!GUILD_ID) {
  console.error('Error: GUILD_ID required (env or second arg)');
  process.exit(1);
}
if (!fs.existsSync(XLS_FILE)) {
  console.error('File not found:', XLS_FILE);
  process.exit(1);
}

function esc(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  return `'${String(val)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n')}'`;
}

function parseAmount(raw) {
  if (!raw) return null;
  const n = parseFloat(String(raw).replace(/[฿,]/g, ''));
  return isNaN(n) ? null : n;
}

function buildNote(count, amount, monthly) {
  const parts = [];
  if (count) parts.push(`บริจาค ${count} ครั้ง`);
  if (amount !== null) parts.push(`รวม ${amount.toLocaleString('th-TH')} บาท`);
  if (monthly && monthly !== 'ไม่มี') parts.push(`รายเดือน: ${monthly}`);
  return parts.length ? parts.join(' | ') : null;
}

process.stderr.write(`Reading: ${XLS_FILE}\n`);
process.stderr.write(`Guild: ${GUILD_ID}\n`);

const wb   = XLSX.readFile(XLS_FILE);
const ws   = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

const header = (rows[0] || []).map(v => (v == null ? '' : String(v).replace(/ /g, ' ').trim()));
const colIdx = {
  name:    header.indexOf('ชื่อ-สกุล'),
  phone:   header.indexOf('เบอร์โทร'),
  province:header.indexOf('จังหวัด'),
  amphoe:  header.indexOf('อำเภอ'),
  count:   header.indexOf('จำนวนครั้ง'),
  amount:  header.findIndex(h => h.startsWith('จำนวนเงินรวม')),
  monthly: header.indexOf('บริจาครายเดือน'),
};

process.stderr.write(`Columns detected: ${JSON.stringify(colIdx)}\n`);
process.stderr.write(`Total data rows: ${rows.length - 1}\n`);
process.stderr.write('Parsing...\n');

const contacts = [];
let skipped = 0;

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const fullName = colIdx.name >= 0 ? String(row[colIdx.name] ?? '').trim() : '';
  if (!fullName) { skipped++; continue; }

  const parts     = fullName.split(/\s+/);
  const firstName = parts[0] || '';
  const lastName  = parts.slice(1).join(' ') || null;

  const phone    = colIdx.phone    >= 0 ? (String(row[colIdx.phone]    ?? '').trim() || null) : null;
  const province = colIdx.province >= 0 ? (String(row[colIdx.province] ?? '').trim() || null) : null;
  const amphoe   = colIdx.amphoe   >= 0 ? (String(row[colIdx.amphoe]   ?? '').trim() || null) : null;
  const count    = colIdx.count    >= 0 ? row[colIdx.count]  : null;
  const amount   = colIdx.amount   >= 0 ? parseAmount(row[colIdx.amount]) : null;
  const monthly  = colIdx.monthly  >= 0 ? (String(row[colIdx.monthly] ?? '').trim() || null) : null;

  const note = buildNote(count, amount, monthly);

  contacts.push({ firstName, lastName, phone, province, amphoe, note });

  if (i % 100 === 0) process.stdout.write(`\r  ${i}/${rows.length - 1}`);
}

process.stdout.write(`\r  ${contacts.length}/${rows.length - 1} parsed (${skipped} skipped)\n`);

// ─── Generate SQL ──────────────────────────────────────────────────────────

const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out  = path.resolve(__dirname, `../../backups/calling/contact-import-${ts}.sql`);
const lines = [];

lines.push('-- ============================================================');
lines.push(`-- Contact Import — calling_contacts`);
lines.push(`-- Source: ${XLS_FILE}`);
lines.push(`-- Generated: ${new Date().toISOString()}`);
lines.push(`-- Contacts: ${contacts.length}  |  Skipped: ${skipped}`);
lines.push(`-- Guild: ${GUILD_ID}`);
lines.push('-- Review before running!');
lines.push('-- ============================================================');
lines.push('');
lines.push(`-- ─── calling_contacts (${contacts.length}) ────────────────────────────────────`);
lines.push('INSERT INTO calling_contacts');
lines.push('  (guild_id, first_name, last_name, phone, category, province, amphoe, note)');
lines.push('VALUES');
lines.push(contacts.map((c, idx) => {
  const comma = idx < contacts.length - 1 ? ',' : '';
  return `  (${esc(GUILD_ID)}, ${esc(c.firstName)}, ${esc(c.lastName)}, ${esc(c.phone)}, 'donor', ${esc(c.province)}, ${esc(c.amphoe)}, ${esc(c.note)})${comma}`;
}).join('\n'));
lines.push(';');
lines.push('');
lines.push('-- Done.');

fs.writeFileSync(out, lines.join('\n'), 'utf8');

process.stderr.write(`\nSQL written to: ${out}\n`);
process.stderr.write(`Review, then run:\n`);
process.stderr.write(`  psql -U pple_dcbot pple_volunteers -f ${out}\n`);
