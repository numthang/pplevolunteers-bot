/**
 * scripts/backfill-intro-channel.js
 *
 * ดึงข้อมูลจากห้องแนะนำตัว แล้ว normalize ลง dc_members
 *
 * วิธีใช้:
 *   node scripts/backfill-intro-channel.js            ← run จริง
 *   node scripts/backfill-intro-channel.js --dry-run  ← ดูผล parse โดยไม่แตะ db
 */

require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const CONFIG = {
  GUILD_ID: '1111998833652678757',
  INTRO_CHANNEL_ID: '1112047965079617708',
  FETCH_LIMIT: 100,
};

// ─── DB ──────────────────────────────────────────────────────────────────────
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
};

// ─── PARSE ───────────────────────────────────────────────────────────────────
const FIELD_DEFS = [
  { key: 'ชื่อ',      pattern: 'ชื่อ' },
  { key: 'แนะนำโดย', pattern: 'แนะนำ\\s*:?\\s*โดย' },
  { key: 'อายุ',      pattern: 'อายุ' },
  { key: 'ปัจจุบัน', pattern: 'ปัจจุบัน' },
  { key: 'สนใจ',     pattern: 'สนใจ' },
  { key: 'สกิล',     pattern: 'สกิล' },
  { key: 'อำเภอ',    pattern: 'อำเภอ', short: true },
  { key: 'ติดยศ',    pattern: 'ติดยศ' },
];

function parseIntroMessage(content) {
  const raw = content.replace(/__Stickied Message:__/g, '').trim();
  const result = {};

  for (let i = 0; i < FIELD_DEFS.length; i++) {
    const { key, pattern, short } = FIELD_DEFS[i];
    const nextPatterns = FIELD_DEFS.slice(i + 1).map(f => f.pattern);
    const keyLookahead = nextPatterns.length > 0
      ? `(?=${nextPatterns.join('|')}|$)`
      : '(?=$)';

    if (short) {
      const regex = new RegExp(`${pattern}\\s*:?\\s*([^\\n]*?)\\s*(?=\\n|${nextPatterns.join('|')}|$)`, 'i');
      const m = raw.match(regex);
      if (m) {
        const val = m[1].trim();
        if (val) result[key] = val;
      }
    } else {
      const normalized = raw.replace(/\s+/g, ' ');
      const m = normalized.match(new RegExp(`${pattern}\\s*:?\\s*([^]*?)\\s*${keyLookahead}`, 'i'));
      if (m) {
        const val = m[1].trim();
        if (val) result[key] = val;
      }
    }
  }

  return result;
}

/**
 * แยก field ชื่อ → { firstname, lastname, nickname }
 *
 * "สินวัตร์ หาเรือนมิตร (กี้/เดียร์)"  → fn=สินวัตร์  ln=หาเรือนมิตร  nn=กี้
 * "ต้น"                                  → fn=ต้น        ln=null         nn=null
 * "xxx (กุ้ง)"                           → fn=xxx        ln=null         nn=กุ้ง
 * "อี๊ฟ (อิ๋ง-อิ๋ง)"                    → fn=อี๊ฟ       ln=null         nn=อิ๋ง-อิ๋ง
 */
function parseName(raw) {
  if (!raw) return { firstname: null, lastname: null, nickname: null };

  // ดึง nickname ในวงเล็บ — เอาตัวแรกก่อน / หรือ ,
  let nickname = null;
  const parenMatch = raw.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const inner = parenMatch[1].trim();
    nickname = inner.split(/[\/,]/)[0].trim() || null;
  }

  // ตัดวงเล็บและ noise ออก (เช่น "อาย : 33")
  const nameOnly = raw
    .replace(/\([^)]*\)/g, '')
    .replace(/อาย\s*:?\s*\d+/gi, '')
    .trim();

  const parts = nameOnly.split(/\s+/).filter(Boolean);

  let firstname = null;
  let lastname  = null;

  if (parenMatch) {
    // มีวงเล็บ → ข้างนอกคือชื่อจริง
    firstname = parts[0] || null;
    lastname  = parts.length >= 2 ? parts.slice(1).join(' ') : null;
  } else {
    // ไม่มีวงเล็บ → ถือว่าเป็นชื่อเล่น ใส่ nickname แทน
    nickname = parts.join(' ') || null;
  }

  return { firstname, lastname, nickname };
}

function toMemberRow(parsed, message) {
  const trunc = (val, len) => val ? String(val).slice(0, len) : null;
  const interestsParts = [parsed['ปัจจุบัน'], parsed['สนใจ']].filter(Boolean);
  const { firstname, lastname, nickname } = parseName(parsed['ชื่อ']);

  return {
    guild_id:     CONFIG.GUILD_ID,
    discord_id:   message.author.id,
    username:     trunc(message.author.username, 100),
    firstname:    trunc(firstname, 100),
    lastname:     trunc(lastname,  100),
    nickname:     trunc(nickname,  100),
    referred_by:  trunc(parsed['แนะนำโดย'], 255),
    specialty:    parsed['สกิล'] || null,
    interests:    interestsParts.length > 0 ? interestsParts.join(' / ') : null,
    amphoe:       trunc(parsed['อำเภอ'], 100),
    registered_at: message.createdAt,
  };
}

// ─── UPSERT ──────────────────────────────────────────────────────────────────
async function upsertMember(db, row) {
  const [existing] = await db.execute(
    `SELECT id, firstname, lastname, nickname, referred_by, specialty, interests, amphoe
     FROM dc_members WHERE guild_id = ? AND discord_id = ? LIMIT 1`,
    [row.guild_id, row.discord_id]
  );

  if (existing.length === 0) {
    await db.execute(
      `INSERT INTO dc_members
         (guild_id, discord_id, username, firstname, lastname, nickname, referred_by, specialty, interests, amphoe, registered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.guild_id, row.discord_id, row.username,
        row.firstname, row.lastname, row.nickname,
        row.referred_by, row.specialty, row.interests,
        row.amphoe, row.registered_at,
      ]
    );
    return 'inserted';
  }

  const current = existing[0];
  const updates = { username: row.username };

  for (const col of ['firstname', 'lastname', 'nickname', 'referred_by', 'specialty', 'interests', 'amphoe']) {
    if ((current[col] === null || current[col] === '') && row[col] !== null) {
      updates[col] = row[col];
    }
  }

  if (Object.keys(updates).length > 1) {
    const setClauses = Object.keys(updates).map(k => `\`${k}\` = ?`).join(', ');
    await db.execute(
      `UPDATE dc_members SET ${setClauses} WHERE id = ?`,
      [...Object.values(updates), current.id]
    );
    return 'updated';
  }

  return 'skipped';
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  const logLines = [];
  const log = (msg) => { console.log(msg); logLines.push(msg); };

  log(`[${new Date().toISOString()}] เริ่ม backfill-intro-channel${DRY_RUN ? ' (DRY-RUN)' : ''}`);
  if (DRY_RUN) log('⚠️  DRY-RUN MODE — ไม่มีการเขียนลง db');

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  const db = DRY_RUN ? null : await mysql.createConnection(dbConfig);
  await client.login(process.env.TOKEN);
  log('Bot logged in');

  const guild = await client.guilds.fetch(CONFIG.GUILD_ID);
  const channel = await guild.channels.fetch(CONFIG.INTRO_CHANNEL_ID);

  if (!channel?.isTextBased()) {
    log('ERROR: channel ไม่ถูกต้องหรือไม่ใช่ text channel');
    process.exit(1);
  }

  log(`ดึงข้อความจาก #${channel.name}`);

  const allMessages = [];
  let before;

  while (true) {
    const options = { limit: CONFIG.FETCH_LIMIT };
    if (before) options.before = before;

    const batch = await channel.messages.fetch(options);
    if (batch.size === 0) break;

    allMessages.push(...batch.values());
    before = batch.last().id;
    log(`  ดึงมาแล้ว ${allMessages.length} ข้อความ...`);

    if (batch.size < CONFIG.FETCH_LIMIT) break;
  }

  log(`รวมทั้งหมด ${allMessages.length} ข้อความ\n`);

  const stats = { processed: 0, inserted: 0, updated: 0, skipped: 0, bot: 0 };

  for (const message of allMessages) {
    if (message.author.bot) { stats.bot++; continue; }

    const parsed = parseIntroMessage(message.content);
    const row = toMemberRow(parsed, message);
    const none = '(ไม่มี)';

    if (DRY_RUN) {
      log(`[DRY-RUN] ${row.username} (${row.discord_id})`);
      log(`  firstname  → ${row.firstname   ?? none}`);
      log(`  lastname   → ${row.lastname    ?? none}`);
      log(`  nickname   → ${row.nickname    ?? none}`);
      log(`  แนะนำโดย  → ${row.referred_by ?? none}`);
      log(`  สกิล      → ${row.specialty   ?? none}`);
      log(`  interests  → ${row.interests   ?? none}`);
      log(`  อำเภอ     → ${row.amphoe       ?? none}`);
      log(`  posted_at  → ${message.createdAt.toISOString()}`);
      log('');
      stats.processed++;
    } else {
      const result = await upsertMember(db, row);
      stats[result]++;
      log(`  [${result.toUpperCase().padEnd(8)}] ${row.username} | ${row.firstname ?? '-'} ${row.lastname ?? ''} (${row.nickname ?? '-'}) | ${row.amphoe ?? '-'}`);
    }
  }

  log('─'.repeat(70));

  if (DRY_RUN) {
    log(`✅ DRY-RUN เสร็จ: would-process=${stats.processed}  bot_skip=${stats.bot}`);
    log('รัน node scripts/backfill-intro-channel.js เพื่อ write จริง');
  } else {
    log(`✅ เสร็จ: inserted=${stats.inserted}  updated=${stats.updated}  skipped=${stats.skipped}  bot_skip=${stats.bot}`);
    const logDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, `backfill-intro-${Date.now()}.log`);
    fs.writeFileSync(logPath, logLines.join('\n'));
    log(`Log saved → ${logPath}`);
  }

  if (db) await db.end();
  client.destroy();
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});