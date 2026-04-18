// scripts/backfill-missing-channels.js
// อ่าน log ไฟล์ที่ระบุ แล้ว fetch thread IDs ที่ "ไม่พบใน guild" โดยตรง
//
// Usage:
//   node scripts/backfill-missing-channels.js --guild GUILD_ID --log LOG_FILE
//   node scripts/backfill-missing-channels.js --guild GUILD_ID --log LOG_FILE 2020-01-01
//   node scripts/backfill-missing-channels.js --guild GUILD_ID --log LOG_FILE 2020-01-01 2025-12-31
//
// Example:
//   node scripts/backfill-missing-channels.js --guild 1111998833652678757 --log logs/backfill-ratchaburi.log 2020-01-01

require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const pool = require('../../db/index');
const { upsertDailyActivity, addMention } = require('../../db/activity');

const BATCH_SIZE = 100;
const DELAY_MS   = 1500;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Logger ────────────────────────────────────────────────────────────────────
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const _now = new Date(Date.now() + 7 * 60 * 60 * 1000);
const logFile = path.join(logDir, `backfill-missing-${_now.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(...args) {
  const line = args.join(' ');
  console.log(line);
  logStream.write(line + '\n');
}
function logWarn(...args) {
  const line = args.join(' ');
  console.warn(line);
  logStream.write(line + '\n');
}
function logError(...args) {
  const line = args.join(' ');
  console.error(line);
  logStream.write(line + '\n');
}

// ── Parse arguments ───────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);

  // --guild
  const guildIdx = args.indexOf('--guild');
  if (guildIdx === -1 || !args[guildIdx + 1]) {
    logError('❌ ต้องระบุ --guild GUILD_ID ครับ');
    process.exit(1);
  }
  const guildId = args[guildIdx + 1];

  // --log
  const logIdx = args.indexOf('--log');
  if (logIdx === -1 || !args[logIdx + 1]) {
    logError('❌ ต้องระบุ --log LOG_FILE ครับ');
    logError('   เช่น: --log logs/backfill-ratchaburi.log');
    process.exit(1);
  }
  const inputLog = args[logIdx + 1];

  // เอา flags ออก เหลือแค่ date args
  const dateArgs = args.filter((_, i) =>
    i !== guildIdx && i !== guildIdx + 1 &&
    i !== logIdx   && i !== logIdx + 1
  );
  const [arg1, arg2] = dateArgs;

  let start, end;
  if (!arg1) {
    start = new Date(Date.now() - 30 * 86400000);
    start.setHours(0, 0, 0, 0);
    end = new Date();
  } else if (/^\d+$/.test(arg1)) {
    start = new Date(Date.now() - parseInt(arg1, 10) * 86400000);
    start.setHours(0, 0, 0, 0);
    end = new Date();
  } else {
    start = new Date(arg1);
    start.setHours(0, 0, 0, 0);
    end = arg2 ? new Date(arg2) : new Date();
    end.setHours(23, 59, 59, 999);
  }

  if (isNaN(start.getTime())) {
    logError('❌ รูปแบบวันที่ไม่ถูกต้อง ใช้ YYYY-MM-DD ครับ');
    process.exit(1);
  }

  return { guildId, inputLog, start, end };
}

// ── อ่าน missing IDs จาก log ที่ระบุ ────────────────────────────────────────
function readMissingIds(inputLog) {
  const fullPath = path.isAbsolute(inputLog)
    ? inputLog
    : path.join(__dirname, '..', inputLog);

  if (!fs.existsSync(fullPath)) {
    logError(`❌ ไม่พบไฟล์: ${fullPath}`);
    process.exit(1);
  }

  log(`📄 อ่าน missing IDs จาก: ${fullPath}`);
  const content = fs.readFileSync(fullPath, 'utf8');
  const ids = [];

  for (const line of content.split('\n')) {
    const match = line.match(/⚠️\s+ไม่พบ channel (\d+)/);
    if (match) ids.push(match[1]);
  }

  return ids;
}

// ── Fetch with retry ──────────────────────────────────────────────────────────
async function fetchWithRetry(channel, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await channel.messages.fetch(options);
    } catch (err) {
      if (err.status === 429) {
        const wait = (err.retryAfter ?? 5) * 1000;
        logWarn(`  ⚠️  Rate limited — รอ ${wait}ms...`);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

// ── Backfill channel ──────────────────────────────────────────────────────────
async function backfillChannel(channel, guildId, start, end) {
  const isThread   = channel.isThread?.() ?? false;
  const typeLabel  = isThread ? '🧵 thread' : '💬 text';
  const parentName = channel.parent?.name ? ` (ใน #${channel.parent.name})` : '';
  log(`  📥 ${typeLabel} #${channel.name}${parentName}`);

  const resolvedChannelId = isThread
    ? (channel.parentId ?? channel.id)
    : channel.id;

  let lastId   = null;
  let fetched  = 0;
  let upserted = 0;
  let hasMore  = true;

  while (hasMore) {
    const options = { limit: BATCH_SIZE };
    if (lastId) options.before = lastId;

    let messages;
    try {
      messages = await fetchWithRetry(channel, options);
    } catch (err) {
      if (err.code === 50001 || err.code === 50013) {
        log(`  ⛔ ไม่มีสิทธิ์อ่าน #${channel.name} — ข้ามครับ\n`);
        return 'no_access';
      }
      if (err.code === 10003) {
        log(`  ❌ Channel ไม่มีอยู่จริง — ข้ามครับ\n`);
        return 'not_found';
      }
      throw err;
    }
    if (!messages.size) break;

    const daily = new Map();

    for (const msg of messages.values()) {
      if (msg.createdAt < start) { hasMore = false; break; }
      if (msg.createdAt > end)   continue;
      if (msg.author.bot)        continue;

      const date = msg.createdAt.toISOString().slice(0, 10);
      const key  = `${msg.author.id}:${date}:${resolvedChannelId}`;
      daily.set(key, (daily.get(key) ?? 0) + 1);

      for (const [mentionedId, mentionedUser] of msg.mentions.users) {
        if (mentionedUser.bot) continue;
        await addMention({
          guildId,
          userId:      mentionedId,
          mentionedBy: msg.author.id,
          channelId:   resolvedChannelId,
          timestamp:   msg.createdAt,
        }).catch(() => {});
      }
    }

    for (const [key, count] of daily) {
      const [userId, date, channelId] = key.split(':');
      await upsertDailyActivity({ guildId, userId, channelId, date, messageDelta: count });
      upserted += count;
    }

    fetched += messages.size;
    lastId   = messages.last()?.id;
    log(`    → fetch ${fetched} / upsert ${upserted} msgs... (hasMore: ${hasMore})`);
    await sleep(DELAY_MS);
  }

  log(`  ✅ เสร็จ — fetch ${fetched}, upsert ${upserted} msgs\n`);
  return 'ok';
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const { guildId, inputLog, start, end } = parseArgs();

  log(`📄 Log file: ${logFile}`);
  log(`🏠 Guild ID: ${guildId}`);
  log(`📂 Input log: ${inputLog}`);
  log(`🔄 Backfill ตั้งแต่ ${start.toISOString().slice(0, 10)} ถึง ${end.toISOString().slice(0, 10)}\n`);

  const missingIds = readMissingIds(inputLog);
  log(`🔍 พบ ${missingIds.length} channels/threads ที่ต้อง retry\n`);

  if (!missingIds.length) {
    log('ℹ️ ไม่มี channel ที่ต้อง retry ครับ');
    logStream.end();
    process.exit(0);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once('ready', async () => {
    log(`✅ Login as ${client.user.tag}\n`);

    const stats = { ok: 0, no_access: 0, not_found: 0, wrong_guild: 0, error: 0 };

    try {
      for (const channelId of missingIds) {
        let channel;
        try {
          channel = await client.channels.fetch(channelId);
        } catch (err) {
          if (err.code === 10003) {
            log(`  ❌ ${channelId} — ไม่มีอยู่จริง\n`);
            stats.not_found++;
          } else if (err.code === 50001) {
            log(`  ⛔ ${channelId} — ไม่มีสิทธิ์\n`);
            stats.no_access++;
          } else {
            logWarn(`  ⚠️  ${channelId} — error: ${err.message}\n`);
            stats.error++;
          }
          continue;
        }

        // ตรวจว่า channel อยู่ใน guild ที่ระบุ
        const channelGuildId = channel.guildId ?? channel.guild?.id;
        if (channelGuildId !== guildId) {
          log(`  ⏭️  ${channelId} — อยู่คนละ guild ข้ามครับ\n`);
          stats.wrong_guild++;
          continue;
        }

        const result = await backfillChannel(channel, guildId, start, end);
        stats[result] = (stats[result] ?? 0) + 1;

        await sleep(DELAY_MS);
      }

      log('\n📊 สรุป:');
      log(`  ✅ สำเร็จ:          ${stats.ok}`);
      log(`  ⛔ ไม่มีสิทธิ์:     ${stats.no_access}`);
      log(`  ❌ ไม่มีจริง:       ${stats.not_found}`);
      log(`  ⏭️  คนละ guild:     ${stats.wrong_guild}`);
      log(`  ⚠️  Error อื่น:     ${stats.error}`);
      log('\n🎉 เสร็จสมบูรณ์ครับ!');

    } catch (err) {
      logError('❌ Error:', err);
    } finally {
      logStream.end();
      await pool.end();
      client.destroy();
      process.exit(0);
    }
  });

  client.login(process.env.TOKEN);
}

main();