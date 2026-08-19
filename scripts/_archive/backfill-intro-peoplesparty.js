/**
 * scripts/data/backfill-intro-peoplesparty.js
 *
 * ดึงข้อความจากห้องแนะนำตัว server "people party" (free-form text)
 * → parse: ชื่อ-สกุล / ชื่อเล่น / จังหวัด / ตำแหน่ง → upsert ลง dc_members
 *
 * ต่างจาก ratchaburi: server นี้ไม่มี Discord Forms รูปแบบไม่นิ่ง
 *   - มี label (**ชื่อ-สกุล:**) บ้าง ไม่มีบ้าง (พิมพ์ 4 บรรทัดเปล่า)
 *   - fallback: detect จังหวัดจาก list 77 จังหวัด แล้ว map บรรทัดที่เหลือ
 *
 * วิธีใช้:
 *   node scripts/data/backfill-intro-peoplesparty.js --dry-run   ← ดูผล parse ไม่แตะ db
 *   node scripts/data/backfill-intro-peoplesparty.js             ← run จริง (fill-null-only)
 *
 * PRODUCTION: sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/data/backfill-intro-peoplesparty.js'
 */

require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const pool = require('../../db/index');

const DRY_RUN = process.argv.includes('--dry-run');
const SQL_OUT = process.argv.includes('--sql'); // เขียนไฟล์ .sql แทน upsert (ไม่ต่อ db)

const CONFIG = {
  GUILD_ID: '1115613658408566844',
  INTRO_CHANNEL_ID: '1115613659297751072',
  FETCH_LIMIT: 100,
};

// ─── จังหวัด 77 จังหวัด (ใช้ validate ใน fallback) ───────────────────────────
const PROVINCES = [
  'กรุงเทพ', 'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร',
  'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร',
  'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก', 'นครปฐม',
  'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส',
  'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์', 'ปราจีนบุรี',
  'ปัตตานี', 'พระนครศรีอยุธยา', 'อยุธยา', 'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร',
  'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์', 'แพร่', 'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร',
  'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี',
  'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล',
  'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี',
  'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู',
  'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี',
];

// คำนำหน้าชื่อ ที่ตัดออกตอนแยก firstname
const TITLES = [
  'นางสาว', 'นาง', 'นาย', 'น.ส.', 'ดร.', 'ผศ.', 'รศ.', 'ศ.',
  'ว่าที่ร้อยตรี', 'ว่าที่ ร.ต.', 'ส.ส.', 'ส.ต.', 'พ.ต.', 'จ.ส.อ.',
  'ร.ต.', 'พล.ต.', 'พ.ท.', 'นพ.', 'พญ.', 'อ.', 'คุณ',
];

// ─── CLEAN ───────────────────────────────────────────────────────────────────
function cleanContent(raw) {
  return raw
    .replace(/__\*\*Stickied Message:\*\*__/gi, '')
    .replace(/__\*\*Stickied Message:/gi, '')
    .replace(/\*\*/g, '')
    .replace(/🍊|🧡|🙏🏻|🙏|🤍|💙|🟠|💚|❤️|♥️|🐢|✊🏻|✊|⭐︎/g, '')
    // template header ที่ forward มา
    .replace(/.*รบกวนช่วยกรอกข้อมูลตามรูปแบบด้านล่าง.*/g, '')
    .replace(/.*ยินดีต้อนรับทุกท่าน.*/g, '')
    // greeting เปล่า (ทั้งบรรทัด)
    .replace(/^\s*สวัสดี(ครับ|ค่ะ|คะ|จ้า|ครับผม)?\s*\/?\s*(ครับ|ค่ะ|คะ)?\s*$/gm, '')
    .trim();
}

const LABELS = {
  nickname: /^\s*ชื่อ\s*เล่น/,
  name: /^\s*ชื่อ(\s*[-–]\s*(นาม)?สกุล|\s*นามสกุล)?/,
  province: /^\s*จังหวัด/,
  position: /^\s*(ตำแหน่ง|คำแหน่ง)/,
};

function stripLabel(line, re) {
  // ตัด label + separator (: ： space) ออก เหลือ value
  return line.replace(re, '').replace(/^\s*[:：]?\s*/, '').trim();
}

// ─── PARSE ───────────────────────────────────────────────────────────────────
function parseIntro(rawContent) {
  const cleaned = cleanContent(rawContent);
  if (!cleaned) return null;

  const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const fields = { name: null, nickname: null, province: null, position: null };

  // 1) Labeled mode — เก็บค่าตาม label (เช็ค nickname ก่อน name)
  let foundLabel = false;
  const leftover = [];
  for (const line of lines) {
    if (LABELS.nickname.test(line)) { fields.nickname = stripLabel(line, LABELS.nickname); foundLabel = true; }
    else if (LABELS.name.test(line)) { fields.name = stripLabel(line, LABELS.name); foundLabel = true; }
    else if (LABELS.province.test(line)) { fields.province = stripLabel(line, LABELS.province); foundLabel = true; }
    else if (LABELS.position.test(line)) { fields.position = stripLabel(line, LABELS.position); foundLabel = true; }
    else leftover.push(line);
  }

  // 2) Fallback — ไม่มี label เลย: หาจังหวัดจาก list แล้ว map ตำแหน่งบรรทัด
  if (!foundLabel) {
    const provIdx = lines.findIndex((l) => PROVINCES.some((p) => l.includes(p)));
    if (provIdx === -1) {
      // ไม่มีจังหวัด → เดาไม่ได้ ใช้แค่บรรทัดแรกเป็นชื่อ
      fields.name = lines[0];
      if (lines[1]) fields.nickname = lines[1];
    } else {
      fields.province = lines[provIdx];
      if (provIdx >= 1) fields.name = lines[0];
      if (provIdx >= 2) fields.nickname = lines[1];
      const rest = lines.slice(provIdx + 1);
      if (rest.length) fields.position = rest.join(' ');
    }
  } else if (!fields.province) {
    // labeled แต่ไม่เจอ label จังหวัด → ลองหาจาก leftover
    const hit = leftover.find((l) => PROVINCES.some((p) => l.includes(p)));
    if (hit) fields.province = hit;
  }

  // normalize province ให้เหลือชื่อจังหวัดมาตรฐาน ถ้า match
  if (fields.province) {
    const match = PROVINCES.find((p) => fields.province.includes(p));
    if (match) fields.province = match === 'กรุงเทพ' ? 'กรุงเทพมหานคร' : (match === 'อยุธยา' ? 'พระนครศรีอยุธยา' : match);
  }

  const { firstname, lastname, nickname } = parseName(fields.name, fields.nickname);

  const result = {
    firstname: trunc(firstname, 100),
    lastname: trunc(lastname, 100),
    nickname: trunc(nickname, 100),
    province: trunc(fields.province, 100),
    position: trunc(fields.position, 100),
  };

  // score = จำนวน field ที่ parse ได้
  result._score = ['firstname', 'province', 'nickname', 'position'].filter((k) => result[k]).length;
  return result;
}

function parseName(rawName, rawNick) {
  let nickname = rawNick || null;
  if (!rawName) return { firstname: null, lastname: null, nickname };

  let name = rawName;

  // ดึง nickname ในวงเล็บ ถ้ายังไม่มี
  const paren = name.match(/\(([^)]+)\)/);
  if (paren && !nickname) nickname = paren[1].split(/[\/,]/)[0].trim() || null;
  name = name.replace(/\([^)]*\)/g, '').trim();

  // ชื่อ/เล่น คั่นด้วย /
  if (!nickname && name.includes('/')) {
    const parts = name.split('/').map((s) => s.trim());
    name = parts[0];
    nickname = parts[1] || null;
  }

  // ตัดคำนำหน้า
  for (const t of TITLES) {
    if (name.startsWith(t)) { name = name.slice(t.length).trim(); break; }
  }

  const parts = name.split(/\s+/).filter(Boolean);
  const firstname = parts[0] || null;
  const lastname = parts.length >= 2 ? parts.slice(1).join(' ') : null;

  return { firstname, lastname, nickname };
}

const trunc = (v, n) => (v ? String(v).slice(0, n) : null);

// ─── SQL GEN ─────────────────────────────────────────────────────────────────
const sqlVal = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

function buildSql(rows) {
  const values = rows.map((r) => `  (${sqlVal(CONFIG.GUILD_ID)}, ${sqlVal(r.discord_id)}, ${sqlVal(r.username)}, ${sqlVal(r.firstname)}, ${sqlVal(r.lastname)}, ${sqlVal(r.nickname)}, ${sqlVal(r.province)}, ${sqlVal(r.position)}, ${sqlVal(r.registered_at.toISOString())})`).join(',\n');
  return `-- backfill-intro-peoplesparty — ${new Date().toISOString()}
-- ${rows.length} members | fill-null-only (ไม่ทับค่าเดิม)
-- import:  sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && psql "$DATABASE_URL" -f <ไฟล์นี้>'
BEGIN;
INSERT INTO dc_members
  (guild_id, discord_id, username, firstname, lastname, nickname, province, position, registered_at)
VALUES
${values}
ON CONFLICT (guild_id, discord_id) DO UPDATE SET
  username   = EXCLUDED.username,
  firstname  = COALESCE(dc_members.firstname, EXCLUDED.firstname),
  lastname   = COALESCE(dc_members.lastname,  EXCLUDED.lastname),
  nickname   = COALESCE(dc_members.nickname,  EXCLUDED.nickname),
  province   = COALESCE(dc_members.province,  EXCLUDED.province),
  position   = COALESCE(dc_members.position,  EXCLUDED.position),
  updated_at = CURRENT_TIMESTAMP;
COMMIT;
`;
}

// ─── UPSERT (fill-null-only — ไม่ทับของเดิมที่มีอยู่) ─────────────────────────
async function upsertFillNull(row) {
  const sql = `
  INSERT INTO dc_members
    (guild_id, discord_id, username, firstname, lastname, nickname, province, position, registered_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
  ON CONFLICT (guild_id, discord_id) DO UPDATE SET
    username   = EXCLUDED.username,
    firstname  = COALESCE(dc_members.firstname, EXCLUDED.firstname),
    lastname   = COALESCE(dc_members.lastname,  EXCLUDED.lastname),
    nickname   = COALESCE(dc_members.nickname,  EXCLUDED.nickname),
    province   = COALESCE(dc_members.province,  EXCLUDED.province),
    position   = COALESCE(dc_members.position,  EXCLUDED.position),
    updated_at = CURRENT_TIMESTAMP
  `;
  await pool.query(sql, [
    CONFIG.GUILD_ID, row.discord_id, row.username,
    row.firstname, row.lastname, row.nickname, row.province, row.position,
    row.registered_at,
  ]);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[${new Date().toISOString()}] backfill-intro-peoplesparty${DRY_RUN ? ' (DRY-RUN)' : ''}`);
  if (DRY_RUN) console.log('⚠️  DRY-RUN MODE — ไม่เขียน db\n');

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  await client.login(process.env.DISCORD_BOT_TOKEN);
  console.log(`Bot: ${client.user.tag}`);

  const guild = await client.guilds.fetch(CONFIG.GUILD_ID);
  const channel = await guild.channels.fetch(CONFIG.INTRO_CHANNEL_ID);
  if (!channel?.isTextBased()) {
    console.error('ERROR: channel ไม่ใช่ text channel');
    process.exit(1);
  }

  // fetch ทั้งหมด
  const all = [];
  let before;
  while (true) {
    const opts = { limit: CONFIG.FETCH_LIMIT };
    if (before) opts.before = before;
    const batch = await channel.messages.fetch(opts);
    if (batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last().id;
    process.stdout.write(`\r  fetched ${all.length} messages...`);
    if (batch.size < CONFIG.FETCH_LIMIT) break;
  }
  console.log(`\nรวม ${all.length} messages\n`);

  // เรียงใหม่→เก่า, เลือก parse ที่ดีที่สุดต่อ discord_id (score สูงสุด, tie→ใหม่สุด)
  const sorted = all.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
  const best = new Map(); // discord_id → { row, score }
  let skipped = 0;

  for (const msg of sorted) {
    if (msg.author.bot) { skipped++; continue; }
    if (!msg.content || msg.content.trim() === '') { skipped++; continue; }

    const parsed = parseIntro(msg.content);
    if (!parsed || parsed._score === 0) { skipped++; continue; }

    const existing = best.get(msg.author.id);
    if (!existing || parsed._score > existing.score) {
      best.set(msg.author.id, {
        score: parsed._score,
        row: {
          discord_id: msg.author.id,
          username: trunc(msg.author.username, 100),
          firstname: parsed.firstname,
          lastname: parsed.lastname,
          nickname: parsed.nickname,
          province: parsed.province,
          position: parsed.position,
          registered_at: msg.createdAt,
        },
      });
    }
  }

  console.log(`unique members ที่ parse ได้: ${best.size} (skip ${skipped} messages)\n`);

  const total = best.size;
  let done = 0, errors = 0;
  const rows = [...best.values()].map((b) => b.row);
  const logDir = path.join(__dirname, '..', '..', 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  if (SQL_OUT) {
    const sqlPath = path.join(logDir, `backfill-intro-pp-${Date.now()}.sql`);
    fs.writeFileSync(sqlPath, buildSql(rows));
    console.log(`✅ เขียน SQL ${total} members → ${sqlPath}`);
    console.log(`   review แล้ว import: psql "$DATABASE_URL" -f ${sqlPath}`);
    client.destroy();
    process.exit(0);
  }

  if (DRY_RUN) {
    for (const row of rows) {
      console.log(`${row.username} (${row.discord_id})`);
      console.log(`  ชื่อ-สกุล → ${row.firstname ?? '-'} ${row.lastname ?? ''}`);
      console.log(`  ชื่อเล่น  → ${row.nickname ?? '-'}`);
      console.log(`  จังหวัด  → ${row.province ?? '-'}`);
      console.log(`  ตำแหน่ง  → ${row.position ?? '-'}`);
      console.log('');
    }
    console.log(`✅ DRY-RUN: would upsert ${total} members`);
  } else {
    for (const row of rows) {
      try {
        await upsertFillNull(row);
        done++;
      } catch (err) {
        console.error(`  ✗ ${row.username}: ${err.message}`);
        errors++;
      }
      if ((done + errors) % 20 === 0 || done + errors === total) {
        process.stdout.write(`\r  ${done + errors}/${total} (${errors} errors)`);
      }
    }
    console.log(`\n✅ Done: ${done} upserted, ${errors} errors`);

    const logPath = path.join(logDir, `backfill-intro-pp-${Date.now()}.log`);
    fs.writeFileSync(logPath, JSON.stringify(rows, null, 2));
    console.log(`Log → ${logPath}`);
  }

  await pool.end();
  client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
