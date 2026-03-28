// scripts/backfill-activity.js
// ดึง message history ย้อนหลังจาก channels ใน dc_orgchart_config
//
// Usage:
//   node scripts/backfill-activity.js                             → ย้อนหลัง 30 วัน
//   node scripts/backfill-activity.js 90                          → ย้อนหลัง 90 วัน
//   node scripts/backfill-activity.js 2025-01-01                  → ตั้งแต่ 1 ม.ค. 68 จนถึงวันนี้
//   node scripts/backfill-activity.js 2025-01-01 2025-01-31       → เฉพาะ ม.ค. 68

require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const pool = require('../db/index');
const { upsertDailyActivity, addMention } = require('../db/activity');
const { getConfig } = require('../db/orgchartConfig');

const BATCH_SIZE = 100;
const DELAY_MS   = 1000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Parse arguments ───────────────────────────────────────────────────────────
function parseArgs() {
  const [,, arg1, arg2] = process.argv;

  if (!arg1) {
    const start = new Date(Date.now() - 30 * 86400000);
    start.setHours(0, 0, 0, 0);
    return { start, end: new Date() };
  }

  // ตัวเลข → ย้อนหลัง N วัน
  if (/^\d+$/.test(arg1)) {
    const start = new Date(Date.now() - parseInt(arg1, 10) * 86400000);
    start.setHours(0, 0, 0, 0);
    return { start, end: new Date() };
  }

  // YYYY-MM-DD
  const start = new Date(arg1);
  start.setHours(0, 0, 0, 0);
  const end = arg2 ? new Date(arg2) : new Date();
  end.setHours(23, 59, 59, 999);

  if (isNaN(start.getTime())) {
    console.error('❌ รูปแบบวันที่ไม่ถูกต้อง ใช้ YYYY-MM-DD ครับ');
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
        console.warn(`  ⚠️  Rate limited — รอ ${wait}ms...`);
        await sleep(wait);
      } else if (err.code === 50001) {
        throw err; // re-throw เพื่อให้ backfillChannel จัดการ
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

// ── Backfill channel ──────────────────────────────────────────────────────────
async function backfillChannel(channel, guildId, start, end) {
  const typeLabel = channel.isThread() ? '🧵 thread' : channel.type === 15 ? '📋 forum' : '💬 text';
  console.log(`  📥 ${typeLabel} #${channel.name}`);

  let lastId  = null;
  let total   = 0;
  let hasMore = true;

  while (hasMore) {
    const options = { limit: BATCH_SIZE };
    if (lastId) options.before = lastId;

    let messages;
    try {
      messages = await fetchWithRetry(channel, options);
    } catch (err) {
      if (err.code === 50001) {
        console.log(`  ⛔ ไม่มีสิทธิ์อ่าน #${channel.name} — ข้ามครับ\n`);
        return true; // บอก caller ว่า skipped
      }
      throw err;
    }
    if (!messages.size) break;

    const daily = new Map();

    for (const msg of messages.values()) {
      // เช็ค date ก่อนเสมอ ไม่ว่าจะเป็น bot หรือไม่
      if (msg.createdAt < start) { hasMore = false; break; }
      if (msg.createdAt > end)   continue;
      if (msg.author.bot)        continue;

      const date = msg.createdAt.toISOString().slice(0, 10);
      const key  = `${msg.author.id}:${date}:${channel.id}`;
      daily.set(key, (daily.get(key) ?? 0) + 1);

      for (const [mentionedId, mentionedUser] of msg.mentions.users) {
        if (mentionedUser.bot) continue;
        await addMention({
          guildId,
          userId:      mentionedId,
          mentionedBy: msg.author.id,
          channelId:   channel.id,
          timestamp:   msg.createdAt,
        }).catch(() => {});
      }
    }

    for (const [key, count] of daily) {
      const [userId, date, channelId] = key.split(':');
      await upsertDailyActivity({ guildId, userId, channelId, date, messageDelta: count });
    }

    total  += messages.size;
    lastId  = messages.last()?.id;
    console.log(`    → ${total} messages...`);
    await sleep(DELAY_MS);
  }

  console.log(`  ✅ เสร็จ — ${total} messages\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const { start, end } = parseArgs();

  console.log(`🔄 Backfill ตั้งแต่ ${start.toISOString().slice(0, 10)} ถึง ${end.toISOString().slice(0, 10)}\n`);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once('ready', async () => {
    console.log(`✅ Login as ${client.user.tag}\n`);

    try {
      for (const guild of client.guilds.cache.values()) {
        console.log(`\n🏠 Guild: ${guild.name}`);
        await guild.channels.fetch();

        // fetch active threads ทั้งหมดด้วย
        try {
          const activeThreads = await guild.channels.fetchActiveThreads();
          activeThreads.threads.forEach(t => guild.channels.cache.set(t.id, t));
        } catch (err) {
          console.warn('  ⚠️  fetch active threads ไม่ได้:', err.message);
        }

        const config = await getConfig(guild.id);
        if (!config.size) {
          console.log('  ⚠️  ไม่มี config — รัน /orgchart-scan ก่อนนะครับ');
          continue;
        }

        // รวม text channel ids ทั้งหมดโดยไม่ซ้ำ
        const channelIds = new Set();
        for (const roleConfig of config.values()) {
          for (const ch of roleConfig.textChannels) channelIds.add(ch.id);
        }

        // fetch archived threads ของแต่ละ channel ใน config
        for (const channelId of channelIds) {
          const ch = guild.channels.cache.get(channelId);
          if (!ch) continue;
          if (!ch.threads) continue;
          try {
            let before = undefined;
            while (true) {
              const archived = await ch.threads.fetchArchived({ limit: 100, before });
              archived.threads.forEach(t => {
                guild.channels.cache.set(t.id, t);
                channelIds.add(t.id);
              });
              if (!archived.hasMore) break;
              before = archived.threads.last()?.id;
            }
          } catch (err) {
            console.warn(`  ⚠️  fetch archived threads ของ #${ch.name} ไม่ได้:`, err.message);
          }
        }

        console.log(`  📋 ${channelIds.size} channels จาก ${config.size} roles\n`);

        const skippedChannels = [];

        for (const channelId of channelIds) {
          const channel = guild.channels.cache.get(channelId);
          if (!channel) {
            console.log(`  ⚠️  ไม่พบ channel ${channelId}`);
            skippedChannels.push(`${channelId} (ไม่พบใน guild)`);
            continue;
          }
          if (!channel.isTextBased() && !channel.isThread()) continue;

          const skipped = await backfillChannel(channel, guild.id, start, end);
          if (skipped) skippedChannels.push(`#${channel.name} (${channelId})`);
        }

        if (skippedChannels.length) {
          console.log(`\n⛔ ข้ามไป ${skippedChannels.length} channels (ไม่มีสิทธิ์):`);
          skippedChannels.forEach(ch => console.log(`   • ${ch}`));
        }
      }

      console.log('🎉 Backfill เสร็จสมบูรณ์ครับ!');
    } catch (err) {
      console.error('❌ Error:', err);
    } finally {
      await pool.end();
      client.destroy();
      process.exit(0);
    }
  });

  client.login(process.env.TOKEN);
}

main();
