/**
 * import-members-xls.js
 * Parse calling XLS → generate SQL for review
 *
 * Usage:
 *   node scripts/calling/import-members-xls.js [path/to/file.xlsx]
 *
 * Output:
 *   backups/calling-import-<timestamp>.sql
 *
 * ก่อน run: ตรวจ migration.sql ให้ครบก่อน
 */

'use strict';

const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────────

const XLS_FILE = process.argv[2]
  ?? path.join(__dirname, '../../backups/calling_ราชบุรี.xlsx');

const CAMPAIGN_PROVINCE   = 'ราชบุรี';
const CAMPAIGN_CREATED_BY = 'system'; // placeholder — XLS import ไม่มี discord_id
const IMPORT_DATE         = '2026-04-12 00:00:00'; // used as called_at (no date in XLS)

// Sheets to skip entirely
const SKIP_SHEETS = new Set([
  'อ่านก่อนโทร',
  'Pivot Table 1',
  'บ้านโป่ง ครั้งที่ 3-4',
  'latest',
]);

// ─── SQL helpers ───────────────────────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  const s = String(val)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n');
  return `'${s}'`;
}

function escId(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  return esc(String(val).trim());
}

// ─── Phone normalization ────────────────────────────────────────────────────

function normalizePhone(val) {
  if (!val && val !== 0) return null;
  let s = String(val).replace(/[^0-9]/g, '');
  if (!s) return null;
  // Thai mobile: 10 digits starting with 0
  // Excel stores as numeric → drops leading 0 → becomes 9 digits
  if (s.length === 9 && !s.startsWith('0')) s = '0' + s;
  return s || null;
}

// ─── member_type normalization ──────────────────────────────────────────────

function normalizeMemberType(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (s.includes('ตลอดชีพ')) return 'ตลอดชีพ';
  if (s.includes('รายปี'))   return 'รายปี';
  return s;
}

// ─── Parse latest sheet → calling_members_bq ───────────────────────────────
//
// latest sheet columns (row 1 = sparse header, data from row 2):
//   col0  member_id  (numeric)
//   col1  prefix
//   col2  ชื่อ (firstname)
//   col3  นามสกุล (lastname)
//   col4  member_type
//   col5  phone (numeric)
//   col6  email (unused)
//   col7  line_username
//   col8  phone2 (numeric, backup)
//   col9  district
//   col10 subdistrict/current area
//   col11 province

function parseMembers(wb) {
  const ws   = wb.Sheets['latest'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const rows = [];

  for (let r = 1; r < data.length; r++) {  // row 0 = header
    const row = data[r];
    const rawId = row[0];
    if (!rawId) continue;

    const memberId    = String(rawId).trim();
    const prefix      = String(row[1] || '').trim() || null;
    const firstName   = String(row[2] || '').trim();
    const lastName    = String(row[3] || '').trim();
    const name        = [firstName, lastName].filter(Boolean).join(' ');
    if (!name) continue;

    const memberType  = normalizeMemberType(row[4]);
    const phone       = normalizePhone(row[5]) ?? normalizePhone(row[8]);
    const lineUsername = String(row[7] || '').trim() || null;
    const district    = String(row[9]  || '').trim() || null;
    const subdistrict = String(row[10] || '').trim() || null;
    const province    = String(row[11] || '').trim() || null;

    rows.push({ memberId, prefix, name, memberType, district, subdistrict, province, phone, lineUsername });
  }

  return rows;
}

// ─── Grade extraction from note text ────────────────────────────────────────
// Matches A/B/C/D at start of note (with optional +/-)
// e.g. "A+ มา", "B มาได้", "C- อยู่กรุงเทพ" → 'A', 'B', 'C'

const GRADE_RE = /^([ABCD])[+\-]?(?:\s|$)/i;

function extractGrade(note) {
  if (!note) return null;
  const m = String(note).match(GRADE_RE);
  return m ? m[1].toUpperCase() : null;
}

// ─── Detect round structure in a district sheet ─────────────────────────────
//
// Returns: { dataStart, globalCallerCol, gradeCol, rounds[] }
// Each round: { calledCol, noteCol, callerCol }

function detectSheetStructure(data) {
  const h1 = data[0] || [];
  const h2 = data[1] || [];

  // Find round start columns (ครั้งที่ in h1)
  const roundStartCols = [];
  h1.forEach((v, i) => {
    if (typeof v === 'string' && (v.includes('ครั้งที่') || v.includes('คร้งที่'))) {
      roundStartCols.push(i);
    }
  });

  const rounds = roundStartCols.map((startCol, ri) => {
    const endCol = roundStartCols[ri + 1] ?? (startCol + 6);
    let calledCol = -1, noteCol = -1, callerCol = -1;

    for (let c = startCol; c < endCol; c++) {
      const v = String(h2[c] || '').trim();
      if (v === 'โทรแล้ว' && calledCol === -1)                             calledCol = c;
      if (v.startsWith('หมายเหตุ') && noteCol === -1)                       noteCol = c;
      if (['โดย','ผู้รับผิดชอบ','โทรโดย'].includes(v) && callerCol === -1) callerCol = c;
    }

    return { calledCol, noteCol, callerCol };
  }).filter(r => r.calledCol >= 0);

  // Global caller column (คนโทร / คนรับผิดชอบ) at sheet level
  let globalCallerCol = -1;
  h2.forEach((v, i) => {
    if (v === 'คนโทร' || v === 'คนรับผิดชอบ') globalCallerCol = i;
  });

  // Dedicated grade column — only in โพธาราม (h2 = 'เกรด')
  let gradeCol = -1;
  h2.forEach((v, i) => { if (String(v).trim() === 'เกรด') gradeCol = i; });

  // Data start row: first row where col0 looks like a member_id (677...)
  let dataStart = 3;
  for (let r = 1; r < Math.min(8, data.length); r++) {
    const val = String(data[r][0] || '');
    if (/^677\d+$/.test(val) || /^6\d{9}$/.test(val)) { dataStart = r; break; }
  }

  return { dataStart, globalCallerCol, gradeCol, rounds };
}

// ─── Grade → sig_overall mapping ────────────────────────────────────────────

const GRADE_TO_SIG = { A: 4, B: 3, C: 2, D: 1 };
const SIG_TO_TIER  = { 4: 'A', 3: 'B', 2: 'C', 1: 'D' };

// ─── Parse district sheets → calling_logs + tiers ───────────────────────────
// Returns { logs, lastGrade, campaignNames }
//   logs:          array of log objects (each has campaignName)
//   lastGrade:     Map<memberId, tier letter> — latest grade seen per member
//   campaignNames: ordered array of unique campaign names (in insert order)

function parseLogs(wb) {
  const logs          = [];
  const lastGrade     = new Map(); // memberId → 'A'|'B'|'C'|'D'
  const campaignNames = [];        // ordered unique campaign names

  for (const sheetName of wb.SheetNames) {
    if (SKIP_SHEETS.has(sheetName)) continue;

    const ws   = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    const { dataStart, globalCallerCol, gradeCol, rounds } = detectSheetStructure(data);

    if (rounds.length === 0) {
      process.stderr.write(`[WARN] No calling rounds detected in sheet: ${sheetName}\n`);
      continue;
    }

    // Register one campaign per round of this sheet
    const roundCampaigns = rounds.map((_, ri) => {
      const name = `${sheetName} ราชบุรี ครั้งที่ ${ri + 1}`;
      if (!campaignNames.includes(name)) campaignNames.push(name);
      return name;
    });

    for (let r = dataStart; r < data.length; r++) {
      const row   = data[r];
      const rawId = String(row[0] || '').trim();
      if (!/^677\d+$/.test(rawId) && !/^6\d{9}$/.test(rawId)) continue;

      const memberId     = rawId;
      const globalCaller = globalCallerCol >= 0
        ? (String(row[globalCallerCol] || '').trim() || null)
        : null;

      // Dedicated grade column (โพธาราม col9) — applies to member regardless of rounds
      if (gradeCol >= 0) {
        const g = extractGrade(String(row[gradeCol] || ''));
        if (g) lastGrade.set(memberId, g);
      }

      rounds.forEach((round, ri) => {
        const calledVal = row[round.calledCol];
        const isCalled  = calledVal === true
          || String(calledVal).trim().toUpperCase() === 'TRUE';
        if (!isCalled) return;

        const note = round.noteCol >= 0
          ? (String(row[round.noteCol] || '').trim() || null)
          : null;

        const callerName = round.callerCol >= 0
          ? (String(row[round.callerCol] || '').trim() || globalCaller)
          : globalCaller;

        const grade      = extractGrade(note);
        const sigOverall = grade ? GRADE_TO_SIG[grade] : null;
        if (grade) lastGrade.set(memberId, grade);

        logs.push({ campaignName: roundCampaigns[ri], memberId, callerName, note, sigOverall });
      });
    }
  }

  return { logs, lastGrade, campaignNames };
}

// ─── Generate SQL ───────────────────────────────────────────────────────────

function generateSQL(members, logs, lastGrade, campaignNames) {
  const lines = [];

  // campaign name → SQL variable name (@c1, @c2, ...)
  const campaignVar = new Map();
  campaignNames.forEach((name, i) => campaignVar.set(name, `@c${i + 1}`));

  lines.push('-- ============================================================');
  lines.push('-- Calling System Import — ราชบุรี');
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Members: ${members.length}  |  Campaigns: ${campaignNames.length}  |  Logs: ${logs.length}  |  Tiers: ${lastGrade.size}`);
  lines.push('-- ============================================================');
  lines.push('-- ถ้าต้องการรันใหม่ ให้ลบข้อมูลเก่าก่อน:');
  lines.push('--   DELETE cl FROM calling_logs cl');
  lines.push('--     JOIN calling_campaigns cc ON cl.campaign_id = cc.id');
  lines.push(`--     WHERE cc.created_by = '${CAMPAIGN_CREATED_BY}';`);
  lines.push(`--   DELETE FROM calling_campaigns WHERE created_by = '${CAMPAIGN_CREATED_BY}';`);
  lines.push("--   DELETE FROM calling_member_tiers WHERE tier_source = 'manual';");
  lines.push('-- ============================================================');
  lines.push('');
  lines.push('SET NAMES utf8mb4;');
  lines.push('SET foreign_key_checks = 0;');
  lines.push('');

  // ── Campaigns (one per round per district) ──
  lines.push(`-- ─── calling_campaigns (${campaignNames.length} campaigns) ──────────────────`);
  campaignNames.forEach((name, i) => {
    lines.push(`INSERT INTO calling_campaigns (name, province, created_by)`);
    lines.push(`  VALUES (${esc(name)}, ${esc(CAMPAIGN_PROVINCE)}, ${esc(CAMPAIGN_CREATED_BY)});`);
    lines.push(`SET @c${i + 1} = LAST_INSERT_ID();`);
  });
  lines.push('');

  // ── Members ──
  lines.push('-- ─── calling_members_bq ─────────────────────────────────────');
  lines.push(`-- ${members.length} rows`);
  lines.push('INSERT IGNORE INTO calling_members_bq');
  lines.push('  (member_id, prefix, name, member_type, district, subdistrict, province, phone, line_username)');
  lines.push('VALUES');
  lines.push(members.map(m =>
    `  (${escId(m.memberId)}, ${esc(m.prefix)}, ${esc(m.name)}, ${esc(m.memberType)}, ` +
    `${esc(m.district)}, ${esc(m.subdistrict)}, ${esc(m.province)}, ${esc(m.phone)}, ${esc(m.lineUsername)})`
  ).join(',\n') + ';');
  lines.push('');

  // ── Logs ──
  lines.push('-- ─── calling_logs ───────────────────────────────────────────');
  lines.push(`-- ${logs.length} rows`);
  if (logs.length > 0) {
    lines.push('INSERT INTO calling_logs');
    lines.push('  (campaign_id, member_id, called_by, caller_name, called_at, status, sig_overall, note)');
    lines.push('VALUES');
    lines.push(logs.map(l => {
      const cvar = campaignVar.get(l.campaignName);
      return `  (${cvar}, ${escId(l.memberId)}, NULL, ${esc(l.callerName)}, ` +
        `${esc(IMPORT_DATE)}, 'answered', ${l.sigOverall ?? 'NULL'}, ${esc(l.note)})`;
    }).join(',\n') + ';');
  }
  lines.push('');

  // ── Tiers ──
  lines.push('-- ─── calling_member_tiers ───────────────────────────────────');
  lines.push(`-- ${lastGrade.size} rows (latest grade per member, tier_source='manual')`);
  if (lastGrade.size > 0) {
    lines.push('INSERT INTO calling_member_tiers (member_id, tier, tier_source)');
    lines.push('VALUES');
    lines.push([...lastGrade.entries()].map(([memberId, tier]) =>
      `  (${escId(memberId)}, '${SIG_TO_TIER[GRADE_TO_SIG[tier]]}', 'manual')`
    ).join(',\n'));
    lines.push("ON DUPLICATE KEY UPDATE tier = VALUES(tier), tier_source = 'manual', updated_at = NOW();");
  }
  lines.push('');

  lines.push('SET foreign_key_checks = 1;');
  lines.push('');
  lines.push('-- Done.');

  return lines.join('\n');
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(XLS_FILE)) {
    console.error(`File not found: ${XLS_FILE}`);
    process.exit(1);
  }

  process.stderr.write(`Reading: ${XLS_FILE}\n`);
  const wb = XLSX.readFile(XLS_FILE);

  process.stderr.write('Parsing members from [latest]...\n');
  const members = parseMembers(wb);
  process.stderr.write(`  → ${members.length} members\n`);

  process.stderr.write('Parsing calling logs from district sheets...\n');
  const { logs, lastGrade, campaignNames } = parseLogs(wb);
  process.stderr.write(`  → ${campaignNames.length} campaigns\n`);
  process.stderr.write(`  → ${logs.length} log entries\n`);
  process.stderr.write(`  → ${lastGrade.size} members with grade\n`);

  const sql = generateSQL(members, logs, lastGrade, campaignNames);

  const ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = path.join(__dirname, `../../backups/calling-import-${ts}.sql`);
  fs.writeFileSync(out, sql, 'utf8');

  process.stderr.write(`\nSQL written to: ${out}\n`);
  process.stderr.write('ตรวจ SQL แล้ว import ด้วย:\n');
  process.stderr.write(`  mysql pple_volunteers < ${out}\n`);
}

main();
