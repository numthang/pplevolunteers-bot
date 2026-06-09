/**
 * scripts/extract-intro-csv.js
 *
 * ดึงข้อมูลจากห้องแนะนำตัว และ export เป็น CSV
 *
 * วิธีใช้:
 *   node scripts/extract-intro-csv.js
 *
 * Output: intro-export-{timestamp}.csv
 */

require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const CONFIG = {
  GUILD_ID: '1111998833652678757',
  INTRO_CHANNEL_ID: '1112047965079617708',
  FETCH_LIMIT: 100,
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

function parseName(raw) {
  if (!raw) return { firstname: null, lastname: null, nickname: null };

  let nickname = null;
  const parenMatch = raw.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const inner = parenMatch[1].trim();
    nickname = inner.split(/[\/,]/)[0].trim() || null;
  }

  const nameOnly = raw
    .replace(/\([^)]*\)/g, '')
    .replace(/อาย\s*:?\s*\d+/gi, '')
    .trim();

  const parts = nameOnly.split(/\s+/).filter(Boolean);

  let firstname = null;
  let lastname  = null;

  if (parenMatch) {
    firstname = parts[0] || null;
    lastname  = parts.length >= 2 ? parts.slice(1).join(' ') : null;
  } else {
    nickname = parts.join(' ') || null;
  }

  return { firstname, lastname, nickname };
}

function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] เริ่ม extract-intro-csv`);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  await client.login(process.env.DISCORD_BOT_TOKEN);
  console.log('✓ Bot logged in');

  const guild = await client.guilds.fetch(CONFIG.GUILD_ID);
  const channel = await guild.channels.fetch(CONFIG.INTRO_CHANNEL_ID);

  if (!channel?.isTextBased()) {
    console.error('ERROR: channel ไม่ถูกต้องหรือไม่ใช่ text channel');
    process.exit(1);
  }

  console.log(`ดึงข้อความจาก #${channel.name}`);

  const allMessages = [];
  let before;

  while (true) {
    const options = { limit: CONFIG.FETCH_LIMIT };
    if (before) options.before = before;

    const batch = await channel.messages.fetch(options);
    if (batch.size === 0) break;

    allMessages.push(...batch.values());
    before = batch.last().id;
    process.stdout.write(`\r  ${allMessages.length} ข้อความ...`);

    if (batch.size < CONFIG.FETCH_LIMIT) break;
  }
  console.log(`\nรวมทั้งหมด ${allMessages.length} ข้อความ`);

  // ─── WRITE CSV ───────────────────────────────────────────────────────────
  const csvHeaders = [
    'discord_id',
    'username',
    'firstname',
    'lastname',
    'nickname',
    'referred_by',
    'specialty',
    'interests',
    'age',
    'amphoe',
    'roles',
    'posted_at',
  ];

  const rows = [csvHeaders.map(h => escapeCsv(h)).join(',')];
  let processed = 0;
  let skipped = 0;

  console.log('\nประมวลผล...');

  for (const message of allMessages) {
    if (message.author.bot) {
      skipped++;
      continue;
    }

    const parsed = parseIntroMessage(message.content);
    const { firstname, lastname, nickname } = parseName(parsed['ชื่อ']);
    const interestsParts = [parsed['ปัจจุบัน'], parsed['สนใจ']].filter(Boolean);

    const row = [
      escapeCsv(message.author.id),
      escapeCsv(message.author.username),
      escapeCsv(firstname),
      escapeCsv(lastname),
      escapeCsv(nickname),
      escapeCsv(parsed['แนะนำโดย']),
      escapeCsv(parsed['สกิล']),
      escapeCsv(interestsParts.length > 0 ? interestsParts.join(' / ') : null),
      escapeCsv(parsed['อายุ']),
      escapeCsv(parsed['อำเภอ']),
      escapeCsv(parsed['ติดยศ']),
      escapeCsv(message.createdAt.toISOString()),
    ];

    rows.push(row.join(','));
    processed++;

    if (processed % 50 === 0) {
      process.stdout.write(`\r  ${processed}/${allMessages.length - skipped}`);
    }
  }

  console.log(`\r  ${processed}/${allMessages.length - skipped}  ✓`);

  // Save to file
  const logDir = path.join(__dirname, '../..', 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const timestamp = Date.now();
  const csvPath = path.join(logDir, `intro-export-${timestamp}.csv`);
  fs.writeFileSync(csvPath, rows.join('\n'), 'utf8');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ เสร็จ: processed=${processed}  bot_skip=${skipped}  elapsed=${elapsed}s`);
  console.log(`CSV → ${csvPath}`);

  client.destroy();
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
