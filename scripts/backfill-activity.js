// scripts/backfill-activity.js
// ดึง message history ย้อนหลังทุก channel+thread+forum ใน guild
//
// Usage:
//   node scripts/backfill-activity.js                             → ย้อนหลัง 30 วัน
//   node scripts/backfill-activity.js 90                          → ย้อนหลัง 90 วัน
//   node scripts/backfill-activity.js 2025-01-01                  → ตั้งแต่ 1 ม.ค. 68 จนถึงวันนี้
//   node scripts/backfill-activity.js 2025-01-01 2025-01-31       → เฉพาะ ม.ค. 68

require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const pool = require('../db/index');
const { upsertDailyActivity, addMention } = require('../db/activity');

const BATCH_SIZE = 100;
const DELAY_MS   = 1000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Logger ────────────────────────────────────────────────────────────────────
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, `backfill-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.log`);
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
  const [,, arg1, arg2] = process.argv;

  if (!arg1) {
    const start = new Date(Date.now() - 30 * 86400000);
    start.setHours(0, 0, 0, 0);
    return { start, end: new Date() };
  }

  if (/^\d+$/.test(arg1)) {
    const start = new Date(Date.now() - parseInt(arg1, 10) * 86400000);
    start.setHours(0, 0, 0, 0);
    return { start, end: new Date() };
  }

  const start = new Date(arg1);
  start.setHours(0, 0, 0, 0);
  const end = arg2 ? new Date(arg2) : new Date();
  end.setHours(23, 59, 59, 999);

  if (isNaN(start.getTime())) {
    logError('❌ รูปแบบวันที่ไม่ถูกต้อง ใช้ YYYY-MM-DD ครับ');
    process.exit(1);
  }

  return { start, end };
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
      } else if (err.code === 50001) {
        throw err;
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

// ── Backfill channel ──────────────────────────────────────────────────────────
async function backfillChannel(channel, guildId, start, end) {
  const isThread   = channel.isThread();
  const typeLabel  = isThread ? '🧵 thread' : channel.type === 15 ? '📋 forum' : '💬 text';
  const parentName = channel.parent?.name ? ` (ใน #${channel.parent.name})` : '';
  log(`  📥 ${typeLabel} #${channel.name}${parentName}`);

  // thread ใช้ parentId เพื่อให้ตรงกับ activityTracker และ orgchart config
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
      if (err.code === 50001) {
        log(`  ⛔ ไม่มีสิทธิ์อ่าน #${channel.name} — ข้ามครับ\n`);
        return true;
      }
      throw err;
    }
    if (!messages.size) break;

    const daily = new Map();

    for (const msg of messages.values()) {
      if (msg.createdAt < start) { hasMore = false; break; }
      if (msg.createdAt > end)   continue;
      if (msg.author.bot)        continue;

      // นับ message
      const date = msg.createdAt.toISOString().slice(0, 10);
      const key  = `${msg.author.id}:${date}:${resolvedChannelId}`;
      daily.set(key, (daily.get(key) ?? 0) + 1);

      // บันทึก mentions
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
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const { start, end } = parseArgs();

  log(`📄 Log file: ${logFile}`);
  log(`🔄 Backfill ตั้งแต่ ${start.toISOString().slice(0, 10)} ถึง ${end.toISOString().slice(0, 10)}\n`);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once('ready', async () => {
    log(`✅ Login as ${client.user.tag}\n`);

    try {
      for (const guild of client.guilds.cache.values()) {
        log(`\n🏠 Guild: ${guild.name}`);
        await guild.channels.fetch();

        try {
          const activeThreads = await guild.channels.fetchActiveThreads();
          activeThreads.threads.forEach(t => guild.channels.cache.set(t.id, t));
          log(`  🧵 active threads: ${activeThreads.threads.size}`);
        } catch (err) {
          logWarn('  ⚠️  fetch active threads ไม่ได้:', err.message);
        }

        const channelIds = new Set(
          guild.channels.cache
            .filter(ch => ch.isTextBased() || ch.isThread() || ch.type === 15)
            .map(ch => ch.id)
        );

        let archivedCount = 0;
        for (const ch of guild.channels.cache.values()) {
          if (!ch.threads) continue;
          try {
            let before = undefined;
            while (true) {
              const archived = await ch.threads.fetchArchived({ limit: 100, before });
              archived.threads.forEach(t => {
                guild.channels.cache.set(t.id, t);
                channelIds.add(t.id);
                archivedCount++;
              });
              if (!archived.hasMore) break;
              before = archived.threads.last()?.id;
            }
          } catch (err) {
            logWarn(`  ⚠️  fetch archived threads ของ #${ch.name} ไม่ได้:`, err.message);
          }
        }
        log(`  📦 archived threads: ${archivedCount}`);
        log(`  📋 รวมทั้งหมด ${channelIds.size} channels/threads\n`);

        const skippedChannels = [];

        for (const channelId of channelIds) {
          const channel = guild.channels.cache.get(channelId);
          if (!channel) {
            log(`  ⚠️  ไม่พบ channel ${channelId}`);
            skippedChannels.push(`${channelId} (ไม่พบใน guild)`);
            continue;
          }
          if (!channel.isTextBased() && !channel.isThread()) continue;

          const skipped = await backfillChannel(channel, guild.id, start, end);
          if (skipped) skippedChannels.push(`#${channel.name} (${channelId})`);
        }

        if (skippedChannels.length) {
          log(`\n⛔ ข้ามไป ${skippedChannels.length} channels (ไม่มีสิทธิ์):`);
          skippedChannels.forEach(ch => log(`   • ${ch}`));
        }
      }

      log('🎉 Backfill เสร็จสมบูรณ์ครับ!');
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