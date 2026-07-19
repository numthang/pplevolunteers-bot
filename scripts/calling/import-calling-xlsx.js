/**
 * import-calling-xlsx.js
 * Parse calling log XLSX → SQL for cache_pple_member (partial) + calling logs
 *
 * Usage:
 *   node scripts/calling/import-calling-xlsx.js <file.xlsx> <province> <campaign_id> [--date YYYY-MM-DD]
 *
 * Example:
 *   node scripts/calling/import-calling-xlsx.js calling_log_ราชบุรี.xlsx "ราชบุรี" 70
 *   node scripts/calling/import-calling-xlsx.js calling_log_ราชบุรี.xlsx "ราชบุรี" 70 --date 2026-04-20
 *
 * Output:
 *   backups/calling/calling-import-<province>-<timestamp>.sql
 *
 * Requires:
 *   GUILD_ID env var
 */

'use strict';

require('dotenv').config();
const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

// ─── Args ──────────────────────────────────────────────────────────────────

const XLS_FILE      = process.argv[2];
const PROVINCE_NAME = process.argv[3];
const CAMPAIGN_ID   = parseInt(process.argv[4], 10);

const dateFlag = process.argv.indexOf('--date');
const IMPORT_DATE = dateFlag >= 0 && process.argv[dateFlag + 1]
  ? `${process.argv[dateFlag + 1]} 00:00:00`
  : `${new Date().toISOString().slice(0, 10)} 00:00:00`;

if (!XLS_FILE || !PROVINCE_NAME || !CAMPAIGN_ID || isNaN(CAMPAIGN_ID)) {
  console.error('Usage: node import-calling-xlsx.js <file.xlsx> <province> <campaign_id> [--date YYYY-MM-DD]');
  process.exit(1);
}

const GUILD_ID = process.env.GUILD_ID;
if (!GUILD_ID) {
  console.error('Error: GUILD_ID env var is required');
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

function extractGrade(text) {
  if (!text) return null;
  const m = String(text).match(/\b([ABCD])[+\-]?(?:\s|$)/i);
  return m ? m[1].toUpperCase() : null;
}

const GRADE_TO_SIG = { A: 4, B: 3, C: 2, D: 1 };

// ─── Sheet structure detection ─────────────────────────────────────────────
//
// Row 1 (h1): main headers — ครั้งที่ N marks each calling round
// Row 2 (h2): sub-headers — โทรแล้ว / CALLER_NAME / หมายเหตุ per round
// Row 3+:     data (0-based index 2+)

const SKIP_SHEETS   = new Set(['อ่านก่อนโทร', 'latest']);
const CALLER_LABELS = new Set(['CALLER_NAME', 'ผู้รับผิดชอบ', 'โทรโดย', 'โดย']);

function detectSheetStructure(h1, h2) {
  let detailCol = h1.findIndex(v => v === 'รายละเอียด');
  if (detailCol < 0) detailCol = h2.findIndex(v => v === 'รายละเอียด');

  const tierCol = h2.findIndex(v => String(v ?? '').trim() === 'TIER');

  const roundStartCols = [];
  h1.forEach((v, i) => {
    if (!v) return;
    const m = String(v).match(/ครั้งที่\s*(\d+)/);
    if (m) roundStartCols.push({ col: i, roundNum: parseInt(m[1]) });
  });

  const firstRoundCol = roundStartCols.length ? roundStartCols[0].col : Infinity;

  let globalCallerCol = -1;
  h1.forEach((v, i) => {
    if (i < firstRoundCol && String(v ?? '').trim() === 'CALLER_NAME') globalCallerCol = i;
  });

  const rounds = roundStartCols.map(({ col, roundNum }, ri) => {
    const endCol    = ri + 1 < roundStartCols.length ? roundStartCols[ri + 1].col : col + 4;
    let callerCol = -1, noteCol = -1;
    for (let c = col + 1; c < endCol && c <= col + 3; c++) {
      const sub = String(h2[c] ?? '').trim();
      if (CALLER_LABELS.has(sub) && callerCol < 0) callerCol = c;
      if (sub.startsWith('หมายเหตุ')  && noteCol  < 0) noteCol  = c;
    }
    return { roundNum, calledCol: col, callerCol, noteCol };
  }).filter(r => r.roundNum > 0);

  return { detailCol, tierCol, globalCallerCol, rounds };
}

// ─── Parse all sheets ──────────────────────────────────────────────────────

function parseSheets(wb) {
  const members   = new Map();  // source_id → member data (first occurrence wins)
  const logs      = [];
  const lastGrade = new Map();  // source_id → last grade letter

  for (const sheetName of wb.SheetNames) {
    if (SKIP_SHEETS.has(sheetName)) continue;

    const ws   = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    const h1 = (data[0] ?? []).map(v => (v == null ? null : String(v).trim()));
    const h2 = (data[1] ?? []).map(v => (v == null ? null : String(v).trim()));

    const { detailCol, tierCol, globalCallerCol, rounds } = detectSheetStructure(h1, h2);

    if (detailCol < 0) {
      process.stderr.write(`[WARN] No รายละเอียด column in: ${sheetName}\n`);
      continue;
    }

    const colMap = {
      serial:     h1.findIndex(v => v === 'รหัสสมาชิก'),
      fullname:   h1.findIndex(v => v === 'ชื่อ'),
      membership: h1.findIndex(v => v === 'สมาชิก'),
      amphure:    h1.findIndex(v => v === 'อำเภอ'),
      tambon:     h1.findIndex(v => v === 'ตำบล'),
      phone:      h1.findIndex(v => v === 'เบอร์ติดต่อ'),
    };

    process.stderr.write(
      `  ${sheetName}: rounds=[${rounds.map(r => r.roundNum).join(',')}]` +
      ` detailCol=${detailCol} tier=${tierCol >= 0 ? tierCol : '-'}\n`
    );

    for (let ri = 2; ri < data.length; ri++) {
      const row      = data[ri];
      const cellRef  = XLSX.utils.encode_cell({ r: ri, c: detailCol });
      const sourceId = extractSourceId(ws[cellRef]);
      if (!sourceId) continue;

      // ── member cache (partial) ──
      if (!members.has(sourceId)) {
        const fullName  = colMap.fullname >= 0 ? String(row[colMap.fullname] ?? '').trim() : '';
        const parts     = fullName.split(/\s+/);
        const firstName = parts[0] || '';
        if (firstName) {
          members.set(sourceId, {
            source_id:       sourceId,
            serial:          colMap.serial >= 0      ? (String(row[colMap.serial]     ?? '').trim() || null) : null,
            first_name:      firstName,
            last_name:       parts.slice(1).join(' ') || '-',
            full_name:       fullName || null,
            membership_type: colMap.membership >= 0  ? (String(row[colMap.membership] ?? '').trim() || null) : null,
            home_province:   PROVINCE_NAME,
            home_amphure:    colMap.amphure >= 0     ? (String(row[colMap.amphure]    ?? '').trim() || null) : null,
            home_district:   colMap.tambon >= 0      ? (String(row[colMap.tambon]     ?? '').trim() || null) : null,
            mobile_number:   colMap.phone >= 0       ? (String(row[colMap.phone]      ?? '').trim() || null) : null,
          });
        }
      }

      // ── calling logs ──
      if (rounds.length === 0) continue;

      const globalCaller = globalCallerCol >= 0
        ? (String(row[globalCallerCol] ?? '').trim() || null)
        : null;

      let memberTier = null;
      if (tierCol >= 0 && row[tierCol]) {
        memberTier = extractGrade(String(row[tierCol]));
        if (memberTier) lastGrade.set(sourceId, memberTier);
      }

      for (const round of rounds) {
        const note = round.noteCol >= 0
          ? (String(row[round.noteCol] ?? '').trim() || null)
          : null;
        if (!note) continue;

        const callerName = round.callerCol >= 0
          ? (String(row[round.callerCol] ?? '').trim() || globalCaller)
          : globalCaller;

        const grade      = tierCol >= 0 ? memberTier : extractGrade(note);
        const sigOverall = grade ? GRADE_TO_SIG[grade] : null;
        if (tierCol < 0 && grade) lastGrade.set(sourceId, grade);

        logs.push({ sourceId, callerName, note, status: 'answered', sigOverall });
      }
    }
  }

  return { members, logs, lastGrade };
}

// ─── Generate SQL ───────────────────────────────────────────────────────────

function generateSQL({ members, logs, lastGrade }) {
  const memberArray  = Array.from(members.values());
  const campaignName = `${PROVINCE_NAME}.xlsx`;
  const lines        = [];

  lines.push('-- ============================================================');
  lines.push(`-- Calling Import — ${PROVINCE_NAME}`);
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Members: ${memberArray.length}  |  Logs: ${logs.length}  |  Tiers: ${lastGrade.size}`);
  lines.push('-- Mode: UPSERT (ON CONFLICT DO UPDATE)');
  lines.push(`-- Guild: ${GUILD_ID}`);
  lines.push('-- To re-run, clear old calling data first:');
  lines.push(`--   DELETE FROM calling_logs WHERE campaign_id = ${CAMPAIGN_ID};`);
  lines.push(`--   DELETE FROM calling_member_tiers WHERE tier_source = 'auto';`);
  lines.push('-- ============================================================');
  lines.push('');

  // cache_pple_member (partial)
  if (memberArray.length > 0) {
    lines.push(`-- ─── cache_pple_member (${memberArray.length}) ─────────────────────────────────────`);
    lines.push('INSERT INTO cache_pple_member (');
    lines.push('  source_id, serial, first_name, last_name, full_name, membership_type,');
    lines.push('  home_province, home_amphure, home_district, mobile_number, guild_id');
    lines.push(') VALUES');
    lines.push(memberArray.map(m =>
      `  (${m.source_id}, ${esc(m.serial)}, ${esc(m.first_name)}, ${esc(m.last_name)}, ` +
      `${esc(m.full_name)}, ${esc(m.membership_type)}, ${esc(m.home_province)}, ` +
      `${esc(m.home_amphure)}, ${esc(m.home_district)}, ${esc(m.mobile_number)}, ${esc(GUILD_ID)})`
    ).join(',\n'));
    lines.push('ON CONFLICT (source_id) DO UPDATE SET');
    lines.push('  serial = EXCLUDED.serial, first_name = EXCLUDED.first_name,');
    lines.push('  last_name = EXCLUDED.last_name, full_name = EXCLUDED.full_name,');
    lines.push('  membership_type = EXCLUDED.membership_type, home_province = EXCLUDED.home_province,');
    lines.push('  home_amphure = EXCLUDED.home_amphure, home_district = EXCLUDED.home_district,');
    lines.push('  mobile_number = EXCLUDED.mobile_number, guild_id = EXCLUDED.guild_id,');
    lines.push('  synced_at = CURRENT_TIMESTAMP;');
    lines.push('');
  }

  // cache_pple_event (campaign)
  lines.push(`-- ─── cache_pple_event campaign ──────────────────────────────────`);
  lines.push(`INSERT INTO cache_pple_event (id, type, name, province, guild_id, synced_at)`);
  lines.push(`VALUES (${CAMPAIGN_ID}, 'campaign', ${esc(campaignName)}, ${esc(PROVINCE_NAME)}, ${esc(GUILD_ID)}, NOW())`);
  lines.push(`ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, guild_id = EXCLUDED.guild_id, synced_at = NOW();`);
  lines.push('');

  // calling_logs
  if (logs.length > 0) {
    lines.push(`-- ─── calling_logs (${logs.length}) ─────────────────────────────────────`);
    lines.push('INSERT INTO calling_logs');
    lines.push('  (campaign_id, member_id, caller_name, called_at, status, sig_overall, note, guild_id)');
    lines.push('VALUES');
    lines.push(logs.map(l =>
      `  (${CAMPAIGN_ID}, ${l.sourceId}, ${esc(l.callerName)}, ${esc(IMPORT_DATE)}, ` +
      `'${l.status}', ${l.sigOverall ?? 'NULL'}, ${esc(l.note)}, ${esc(GUILD_ID)})`
    ).join(',\n') + ';');
    lines.push('');
  }

  // calling_member_tiers
  if (lastGrade.size > 0) {
    lines.push(`-- ─── calling_member_tiers (${lastGrade.size}) ─────────────────────────────`);
    lines.push('INSERT INTO calling_member_tiers (member_id, tier, tier_source)');
    lines.push('VALUES');
    lines.push([...lastGrade.entries()].map(([id, tier]) =>
      `  (${id}, '${tier}', 'auto')`
    ).join(',\n'));
    lines.push("ON CONFLICT (member_id, contact_type) DO UPDATE SET tier = EXCLUDED.tier, tier_source = 'auto', updated_at = NOW();");
    lines.push('');
  }

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
  process.stderr.write(`Campaign: ${PROVINCE_NAME} (id=${CAMPAIGN_ID})\n`);
  process.stderr.write(`Guild: ${GUILD_ID}\n`);
  process.stderr.write('Parsing sheets...\n');

  const wb      = XLSX.readFile(XLS_FILE);
  const result  = parseSheets(wb);

  process.stderr.write(`  → ${result.members.size} members\n`);
  process.stderr.write(`  → ${result.logs.length} calling log entries\n`);
  process.stderr.write(`  → ${result.lastGrade.size} members with grade\n`);

  if (result.members.size === 0 && result.logs.length === 0) {
    console.error('No data found');
    process.exit(1);
  }

  const sql = generateSQL(result);

  const ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = path.join(__dirname, `../../backups/calling/calling-log-${PROVINCE_NAME}-${ts}.sql`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, sql, 'utf8');

  process.stderr.write(`\nSQL written to: ${out}\n`);
  process.stderr.write('Review SQL then import:\n');
  process.stderr.write(`  mysql pple_volunteers < ${out}\n`);
}

main();
