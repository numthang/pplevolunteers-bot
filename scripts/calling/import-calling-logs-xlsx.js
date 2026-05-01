/**
 * import-calling-logs-xlsx.js
 * Parse calling log XLSX → generate SQL for review before import
 *
 * Usage:
 *   node scripts/calling/import-calling-logs-xlsx.js <file.xlsx> <province> [--date YYYY-MM-DD]
 *
 * Output:
 *   backups/calling-import-<timestamp>.sql
 *
 * Prereq:  migration.sql + migration-ngs-member-cache.sql must be run first
 */

'use strict';

const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

// ─── Args ──────────────────────────────────────────────────────────────────

const XLS_FILE        = process.argv[2];
const CAMPAIGN_PROVINCE = process.argv[3];

const dateFlag = process.argv.indexOf('--date');
const IMPORT_DATE = dateFlag >= 0 && process.argv[dateFlag + 1]
  ? `${process.argv[dateFlag + 1]} 00:00:00`
  : `${new Date().toISOString().slice(0, 10)} 00:00:00`;

if (!XLS_FILE || !CAMPAIGN_PROVINCE) {
  console.error('Usage: node import-calling-logs-xlsx.js <file.xlsx> <province> [--date YYYY-MM-DD]');
  process.exit(1);
}

const SKIP_SHEETS = new Set(['อ่านก่อนโทร', 'latest']);

// Labels in row2 that indicate "caller name" sub-column
const CALLER_LABELS = new Set(['CALLER_NAME', 'ผู้รับผิดชอบ', 'โทรโดย', 'โดย']);


// ─── Helpers ───────────────────────────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  return `'${String(val)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n')}'`;
}

// Extract source_id from a cell's hyperlink target or formula string
// e.g. =HYPERLINK("https://.../memberships/74879","ดูรายละเอียด") → 74879
function extractSourceId(cell) {
  if (!cell) return null;
  const url = cell.l?.Target ?? cell.f ?? '';
  const m   = String(url).match(/\/memberships\/(\d+)/);
  return m ? parseInt(m[1]) : null;
}

// Extract grade letter A/B/C/D from free text (supports A+, B-, etc.)
function extractGrade(text) {
  if (!text) return null;
  const m = String(text).match(/\b([ABCD])[+\-]?(?:\s|$)/i);
  return m ? m[1].toUpperCase() : null;
}

const GRADE_TO_SIG = { A: 4, B: 3, C: 2, D: 1 };

// ─── Sheet structure detection ─────────────────────────────────────────────
//
// Row 1 (h1): main column headers — ครั้งที่ N marks the start of each round
// Row 2 (h2): sub-headers — โทรแล้ว / CALLER_NAME / หมายเหตุ under each round
// Row 3+:     actual data (index 2 onward, 0-based)
//
// Returns:
//   detailCol      — column index of รายละเอียด (HYPERLINK → source_id)
//   tierCol        — column index of TIER (โพธาราม only, -1 otherwise)
//   globalCallerCol — CALLER_NAME column in row1 that applies to all rounds (-1 if none)
//   rounds[]       — [{ roundNum, calledCol, callerCol, noteCol }]

function detectSheetStructure(h1, h2) {
  // รายละเอียด column: search row1 first, then row2
  let detailCol = h1.findIndex(v => v === 'รายละเอียด');
  if (detailCol < 0) detailCol = h2.findIndex(v => v === 'รายละเอียด');

  // TIER column (row2 only, โพธาราม)
  const tierCol = h2.findIndex(v => String(v ?? '').trim() === 'TIER');

  // Find all ครั้งที่ N headers in row1
  const roundStartCols = [];
  h1.forEach((v, i) => {
    if (!v) return;
    const m = String(v).match(/ครั้งที่\s*(\d+)/);
    if (m) roundStartCols.push({ col: i, roundNum: parseInt(m[1]) });
  });

  const firstRoundCol = roundStartCols.length ? roundStartCols[0].col : Infinity;

  // Global caller: CALLER_NAME in row1 before first round column
  let globalCallerCol = -1;
  h1.forEach((v, i) => {
    if (i < firstRoundCol && String(v ?? '').trim() === 'CALLER_NAME') {
      globalCallerCol = i;
    }
  });

  // Build round descriptors by scanning row2 sub-headers
  const rounds = roundStartCols.map(({ col, roundNum }, ri) => {
    // sub-cols run from this round's col up to the next round's col (or +4 max)
    const endCol   = ri + 1 < roundStartCols.length ? roundStartCols[ri + 1].col : col + 4;
    const calledCol = col; // row2[col] is always โทรแล้ว

    let callerCol = -1, noteCol = -1;
    for (let c = col + 1; c < endCol && c <= col + 3; c++) {
      const sub = String(h2[c] ?? '').trim();
      if (CALLER_LABELS.has(sub) && callerCol < 0) callerCol = c;
      if (sub.startsWith('หมายเหตุ')  && noteCol  < 0) noteCol  = c;
    }

    return { roundNum, calledCol, callerCol, noteCol };
  }).filter(r => r.roundNum > 0);

  return { detailCol, tierCol, globalCallerCol, rounds };
}

// ─── Parse all district sheets ─────────────────────────────────────────────

function parseLogs(wb) {
  const logs      = [];
  const lastGrade = new Map();   // source_id (INT) → 'A'|'B'|'C'|'D'

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
    if (rounds.length === 0) {
      process.stderr.write(`[WARN] No calling rounds in: ${sheetName}\n`);
      continue;
    }

    process.stderr.write(
      `  ${sheetName}: rounds=[${rounds.map(r => r.roundNum).join(',')}]` +
      ` detailCol=${detailCol} tierCol=${tierCol >= 0 ? tierCol : '-'}\n`
    );

    for (let ri = 2; ri < data.length; ri++) {
      const row = data[ri];

      const cellRef  = XLSX.utils.encode_cell({ r: ri, c: detailCol });
      const sourceId = extractSourceId(ws[cellRef]);
      if (!sourceId) continue;

      const globalCaller = globalCallerCol >= 0
        ? (String(row[globalCallerCol] ?? '').trim() || null)
        : null;

      let memberTier = null;
      if (tierCol >= 0 && row[tierCol]) {
        memberTier = extractGrade(String(row[tierCol]));
        if (memberTier) lastGrade.set(sourceId, memberTier);
      }

      rounds.forEach(round => {
        const note = round.noteCol >= 0
          ? (String(row[round.noteCol] ?? '').trim() || null)
          : null;

        if (!note) return;

        const callerName = round.callerCol >= 0
          ? (String(row[round.callerCol] ?? '').trim() || globalCaller)
          : globalCaller;

        const grade      = tierCol >= 0 ? memberTier : extractGrade(note);
        const sigOverall = grade ? GRADE_TO_SIG[grade] : null;
        if (tierCol < 0 && grade) lastGrade.set(sourceId, grade);

        logs.push({ sourceId, callerName, note, status: 'answered', sigOverall });
      });
    }
  }

  return { logs, lastGrade };
}

// ─── Generate SQL ───────────────────────────────────────────────────────────

function generateSQL(logs, lastGrade, campaignName) {
  const lines = [];

  lines.push('-- ============================================================');
  lines.push(`-- Calling Logs Import — ${campaignName}`);
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Logs: ${logs.length}  |  Tiers: ${lastGrade.size}`);
  lines.push('-- ============================================================');
  lines.push('-- To re-run, clear old data first:');
  lines.push(`--   DELETE cl FROM calling_logs cl`);
  lines.push(`--     JOIN act_event_cache cc ON cl.campaign_id = cc.id AND cc.type = 'campaign'`);
  lines.push(`--     WHERE cc.name = ${esc(campaignName)};`);
  lines.push(`--   DELETE FROM act_event_cache WHERE type = 'campaign' AND name = ${esc(campaignName)};`);
  lines.push(`--   DELETE FROM calling_member_tiers WHERE tier_source = 'auto';`);
  lines.push('-- ============================================================');
  lines.push('');
  lines.push('SET NAMES utf8mb4;');
  lines.push('SET foreign_key_checks = 0;');
  lines.push('');

  // ── act_event_cache (campaign) ──
  lines.push(`-- ─── act_event_cache campaign ──────────────────────────────────`);
  lines.push(`INSERT INTO act_event_cache (type, name, province, guild_id, synced_at)`);
  lines.push(`  VALUES ('campaign', ${esc(campaignName)}, ${esc(CAMPAIGN_PROVINCE)}, '1', NOW());`);
  lines.push(`SET @campaign_id = LAST_INSERT_ID();`);
  lines.push('');

  // ── calling_logs ──
  lines.push(`-- ─── calling_logs (${logs.length}) ─────────────────────────────────────`);
  if (logs.length > 0) {
    lines.push('INSERT INTO calling_logs');
    lines.push('  (campaign_id, member_id, caller_name, called_at, status, sig_overall, note)');
    lines.push('VALUES');
    lines.push(logs.map(l =>
      `  (@campaign_id, ${l.sourceId}, ${esc(l.callerName)}, ` +
      `${esc(IMPORT_DATE)}, '${l.status}', ${l.sigOverall ?? 'NULL'}, ${esc(l.note)})`
    ).join(',\n') + ';');
  }
  lines.push('');

  // ── calling_member_tiers ──
  lines.push(`-- ─── calling_member_tiers (${lastGrade.size}) ─────────────────────────────`);
  if (lastGrade.size > 0) {
    lines.push('INSERT INTO calling_member_tiers (member_id, tier, tier_source)');
    lines.push('VALUES');
    lines.push([...lastGrade.entries()].map(([id, tier]) =>
      `  (${id}, '${tier}', 'auto')`
    ).join(',\n'));
    lines.push("ON DUPLICATE KEY UPDATE tier = VALUES(tier), tier_source = 'auto', updated_at = NOW();");
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

  const campaignName = path.basename(XLS_FILE).replace(/\.xlsx?$/i, '');

  process.stderr.write(`Reading: ${XLS_FILE}\n`);
  process.stderr.write(`Campaign: ${campaignName}\n`);
  const wb = XLSX.readFile(XLS_FILE);

  process.stderr.write('Parsing sheets...\n');
  const { logs, lastGrade } = parseLogs(wb);
  process.stderr.write(`  → ${logs.length} log entries\n`);
  process.stderr.write(`  → ${lastGrade.size} members with grade\n`);

  const sql = generateSQL(logs, lastGrade, campaignName);

  const ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = path.join(__dirname, `../../backups/calling-import-${ts}.sql`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, sql, 'utf8');

  process.stderr.write(`\nSQL written to: ${out}\n`);
  process.stderr.write('Review SQL then import:\n');
  process.stderr.write(`  mysql pple_volunteers < ${out}\n`);
}

main();
