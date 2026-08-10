#!/usr/bin/env node
// scripts/migration/moveWatermarksToOrg.js
// ย้ายลายน้ำออกจาก guild → org และเลิกใช้ Discord ID เป็นชื่อโฟลเดอร์ส่วนตัว
//
//   assets/watermark/<guild_id>/<group>/*   → assets/watermark/org_<org_id>/<group>/*
//   assets/watermark/<guild_id>/*           → assets/watermark/org_<org_id>/<กลุ่มเดียวของ guild นั้น>/*
//   assets/watermark/user_<discord_id>/*    → assets/watermark/user_<users.id>/*
//
// ทำไมไฟล์ที่ root ของ guild ถึงไหลเข้ากลุ่ม (เคาะ 2026-08-10): guild หนึ่ง = แบรนด์หนึ่งพอดี
// ไฟล์ที่ root ก็เป็นของแบรนด์นั้น · ถ้ายกไปกองที่ org root ไฟล์ชื่อซ้ำจากคนละ guild จะทับกัน
// (เคสจริง: pple-orange.png/pple-white.png มีคนละเวอร์ชันใน 2 guild ของ org เดียวกัน)
//
// ปลอดภัยเสมอ: ไฟล์ปลายทางมีอยู่แล้ว + เนื้อเหมือนกันเป๊ะ = ข้าม · เนื้อต่างกัน = **หยุดทั้งสคริปต์**
// ไม่เขียนทับอะไรเงียบๆ ทั้งสิ้น
//
// Usage:
//   node scripts/migration/moveWatermarksToOrg.js --dry-run
//   node scripts/migration/moveWatermarksToOrg.js
// PRODUCTION: sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/migration/moveWatermarksToOrg.js'

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../../db/index');

const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets', 'watermark');
const IMG_RE = /\.(png|jpe?g|webp)$/i;
const SNOWFLAKE = /^\d{15,20}$/;
const DRY = process.argv.includes('--dry-run');

const md5 = f => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
const imgsIn = dir => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && IMG_RE.test(e.name)).map(e => e.name);
  } catch { return []; }
};
const subdirsIn = dir => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
  } catch { return []; }
};

const plan = [];   // { from, to }
const skips = [];  // ไฟล์ที่ปลายทางมีอยู่แล้วและเหมือนกันเป๊ะ
const stops = [];  // เหตุที่ต้องให้คนตัดสิน

function planFile(fromAbs, toAbs) {
  if (fs.existsSync(toAbs)) {
    if (md5(fromAbs) === md5(toAbs)) { skips.push(path.relative(ASSETS_DIR, fromAbs)); return; }
    stops.push(`ไฟล์ชนกันและเนื้อต่างกัน: ${path.relative(ASSETS_DIR, fromAbs)} → ${path.relative(ASSETS_DIR, toAbs)}`);
    return;
  }
  // ชนกับไฟล์ที่วางคิวไว้แล้ว (ปลายทางยังไม่มีจริง) — เนื้อเดียวกันก็แค่ทิ้งตัวซ้ำ
  // เคสจริง: ไฟล์ที่ root ของ guild เป็นสำเนาของไฟล์ในโฟลเดอร์กลุ่มอยู่แล้ว
  const queued = plan.find(p => p.to === toAbs);
  if (queued) {
    if (md5(fromAbs) === md5(queued.from)) { skips.push(path.relative(ASSETS_DIR, fromAbs)); return; }
    stops.push(
      `มี 2 ไฟล์เล็งไปที่เดียวกันและเนื้อต่างกัน: ${path.relative(ASSETS_DIR, queued.from)} ` +
      `กับ ${path.relative(ASSETS_DIR, fromAbs)} → ${path.relative(ASSETS_DIR, toAbs)}`
    );
    return;
  }
  plan.push({ from: fromAbs, to: toAbs });
}

async function main() {
  if (!fs.existsSync(ASSETS_DIR)) { console.error('ไม่พบ', ASSETS_DIR); process.exit(1); }

  const { rows: guildRows } = await pool.query(`SELECT guild_id, org_id FROM dc_guilds WHERE org_id IS NOT NULL`);
  const orgOfGuild = Object.fromEntries(guildRows.map(r => [r.guild_id, r.org_id]));

  const { rows: userRows } = await pool.query(`SELECT id, discord_id FROM users WHERE discord_id IS NOT NULL`);
  const userIdOfDiscord = Object.fromEntries(userRows.map(r => [r.discord_id, r.id]));

  const entries = subdirsIn(ASSETS_DIR);
  console.log(`พบโฟลเดอร์ ${entries.length} รายการใน assets/watermark`);

  for (const name of entries) {
    const dirAbs = path.join(ASSETS_DIR, name);

    // ── โฟลเดอร์ส่วนตัว ──────────────────────────────────────────────────────
    if (name.startsWith('user_')) {
      const key = name.slice('user_'.length);
      if (!SNOWFLAKE.test(key)) { console.log(`  ข้าม ${name} (ไม่ใช่ Discord ID — ย้ายไปแล้ว)`); continue; }
      const userId = userIdOfDiscord[key];
      if (!userId) { stops.push(`หา users.id ของ discord_id ${key} ไม่เจอ (${name})`); continue; }
      for (const f of imgsIn(dirAbs)) planFile(path.join(dirAbs, f), path.join(ASSETS_DIR, `user_${userId}`, f));
      continue;
    }

    // ── โฟลเดอร์ guild ───────────────────────────────────────────────────────
    if (!SNOWFLAKE.test(name)) { console.log(`  ข้าม ${name} (ไม่ใช่ guild id)`); continue; }
    const orgId = orgOfGuild[name];
    if (!orgId) { stops.push(`guild ${name} ไม่มี org (guild กำพร้า) — ตัดสินเองว่าจะลบหรือ map เข้า org ไหน`); continue; }

    const groups = subdirsIn(dirAbs);
    for (const g of groups) {
      const gAbs = path.join(dirAbs, g);
      for (const f of imgsIn(gAbs)) planFile(path.join(gAbs, f), path.join(ASSETS_DIR, `org_${orgId}`, g, f));
    }

    // ไฟล์ที่ root ของ guild → กลุ่มเดียวของ guild นั้น
    const rootFiles = imgsIn(dirAbs);
    if (!rootFiles.length) continue;
    if (groups.length === 1) {
      for (const f of rootFiles) planFile(path.join(dirAbs, f), path.join(ASSETS_DIR, `org_${orgId}`, groups[0], f));
    } else {
      stops.push(
        `guild ${name} มีไฟล์ที่ root ${rootFiles.length} ไฟล์ แต่มีกลุ่ม ${groups.length} กลุ่ม (${groups.join(', ') || 'ไม่มีเลย'}) ` +
        `— ตัดสินเองว่าไฟล์ root ควรเข้ากลุ่มไหน`
      );
    }
  }

  console.log(`\nจะย้าย ${plan.length} ไฟล์ · ข้าม (ซ้ำเป๊ะ) ${skips.length} ไฟล์`);
  for (const p of plan) console.log(`  ${path.relative(ASSETS_DIR, p.from)}\n    → ${path.relative(ASSETS_DIR, p.to)}`);
  for (const s of skips) console.log(`  ข้าม (มีอยู่แล้วเนื้อเดียวกัน): ${s}`);

  if (stops.length) {
    console.error(`\n❌ หยุด — มี ${stops.length} เรื่องที่ต้องให้คนตัดสินก่อน:`);
    for (const s of stops) console.error(`  - ${s}`);
    process.exit(1);
  }

  if (DRY) { console.log('\n(dry-run — ยังไม่ได้แตะไฟล์)'); await pool.end(); return; }

  let done = 0, err = 0;
  for (const p of plan) {
    try {
      fs.mkdirSync(path.dirname(p.to), { recursive: true });
      fs.renameSync(p.from, p.to);
      done++;
    } catch (e) { err++; console.error(`\n  [err] ${path.relative(ASSETS_DIR, p.from)}: ${e.message}`); }
    process.stdout.write(`\r  ${done + err}/${plan.length} (${err} errors)`);
  }
  // ไฟล์ซ้ำเป๊ะที่ข้ามไว้ = ลบต้นทางทิ้ง ปลายทางมีของเดียวกันแล้ว
  let dropped = 0;
  for (const rel of skips) {
    try { fs.unlinkSync(path.join(ASSETS_DIR, rel)); dropped++; } catch { /* ไม่เป็นไร */ }
  }
  // เก็บโฟลเดอร์เปล่าที่เหลือ
  let rmdir = 0;
  for (const name of subdirsIn(ASSETS_DIR)) {
    if (!SNOWFLAKE.test(name) && !(name.startsWith('user_') && SNOWFLAKE.test(name.slice(5)))) continue;
    const abs = path.join(ASSETS_DIR, name);
    for (const g of subdirsIn(abs)) { try { fs.rmdirSync(path.join(abs, g)); } catch { /* ยังมีของ */ } }
    try { fs.rmdirSync(abs); rmdir++; } catch { /* ยังมีของ */ }
  }

  console.log(`\nDone: ย้าย ${done} ไฟล์, ${err} errors · ลบไฟล์ซ้ำ ${dropped} · เก็บโฟลเดอร์เก่า ${rmdir}`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
