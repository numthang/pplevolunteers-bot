#!/usr/bin/env node
// scripts/backfill-forum.js
// รัน: node scripts/backfill-forum.js --guild GUILD_ID [--channel CHANNEL_ID]
//
// backfill โพสต์ทั้งหมดใน forum channel ที่มี config เข้า MySQL + Meilisearch

require('dotenv').config();

const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const { upsertForumConfig, upsertForumPost } = require('../db/forum');
const { initMeilisearch, upsertPost } = require('../services/meilisearch');
const pool = require('../db/index');

// ── Args ──────────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const guildIdx = args.indexOf('--guild');
const chanIdx  = args.indexOf('--channel');
const guildArg = guildIdx !== -1 ? args[guildIdx + 1] : null;
const chanArg  = chanIdx  !== -1 ? args[chanIdx  + 1] : null;

if (!guildArg) {
  console.error('Usage: node scripts/backfill-forum.js --guild GUILD_ID [--channel CHANNEL_ID]');
  process.exit(1);
}

// ── Logger ────────────────────────────────────────────────────────────────────
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logFile   = path.join(logDir, `backfill-forum-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(...args)   { const l = args.join(' '); console.log(l);   logStream.write(l + '\n'); }
function logWarn(...args)  { const l = args.join(' '); console.warn(l);  logStream.write(l + '\n'); }
function logError(...args) { const l = args.join(' '); console.error(l); logStream.write(l + '\n'); }

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Backfill channel ──────────────────────────────────────────────────────────
async function backfillChannel(guild, channelId) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel) {
    logWarn(`  ⚠️  channel ${channelId} ไม่พบใน guild`);
    return;
  }
  if (channel.type !== ChannelType.GuildForum) {
    logWarn(`  ⚠️  ${channel.name} ไม่ใช่ Forum channel (type: ${channel.type}) — ข้ามไป`);
    return;
  }

  log(`\n📂 ${channel.name} (${channelId})`);

  // upsert config (ไม่สร้าง dashboard — แค่ให้ค้นหาได้)
  await upsertForumConfig(guild.id, channelId, {});

  // ดึง threads ทั้งหมด (active + archived)
  const active     = await channel.threads.fetchActive();
  const allThreads = [...active.threads.values()];

  let before = undefined;
  while (true) {
    const archived = await channel.threads.fetchArchived({ limit: 100, before });
    allThreads.push(...archived.threads.values());
    if (!archived.hasMore) break;
    before = archived.threads.last()?.id;
    await sleep(500);
  }

  log(`   พบ ${allThreads.length} posts`);

  let successCount = 0;
  let errorCount   = 0;

  for (const thread of allThreads) {
    const label = thread.name.slice(0, 50).padEnd(50);
    process.stdout.write(`   • ${label} `);
    logStream.write(`   • ${label} `);

    try {
      const postUrl = `https://discord.com/channels/${guild.id}/${thread.id}`;

      await upsertForumPost(guild.id, channelId, {
        postId:    thread.id,
        postName:  thread.name,
        postUrl,
        authorId:  thread.ownerId ?? null,
        createdAt: new Date(thread.createdTimestamp),
      });

      // ดึง messages ทั้งหมดใน thread
      let allContent = '';
      let lastId     = null;
      let msgCount   = 0;

      while (true) {
        const opts = { limit: 100 };
        if (lastId) opts.before = lastId;
        const msgs = await thread.messages.fetch(opts).catch(() => null);
        if (!msgs?.size) break;
        for (const msg of msgs.values()) {
          if (!msg.author.bot && msg.content?.trim()) {
            allContent += `\n${msg.content}`;
            msgCount++;
          }
          lastId = msg.id;
        }
        if (msgs.size < 100) break;
        await sleep(500);
      }

      await upsertPost({
        postId:    thread.id,
        postName:  thread.name,
        content:   allContent.trim(),
        postUrl,
        channelId,
        guildId:   guild.id,
        createdAt: thread.createdTimestamp,
      });

      const line = `✅ (${msgCount} msgs)`;
      console.log(line);
      logStream.write(line + '\n');
      successCount++;

    } catch (err) {
      const line = `❌ error: ${err.message}`;
      console.log(line);
      logStream.write(line + '\n');
      errorCount++;
    }

    await sleep(200);
  }

  log(`   ✅ เสร็จ — success: ${successCount}, error: ${errorCount}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', async () => {
  log(`📄 Log file: ${logFile}`);
  log(`🤖 logged in as ${client.user.tag}`);

  try {
    await initMeilisearch();

    const guild = client.guilds.cache.get(guildArg);
    if (!guild) {
      logError(`❌ ไม่พบ guild ${guildArg}`);
      process.exit(1);
    }
    await guild.channels.fetch();

    let channelIds;
    if (chanArg) {
      channelIds = [chanArg];
    } else {
      channelIds = guild.channels.cache
        .filter(ch => ch.type === ChannelType.GuildForum)
        .map(ch => ch.id);
    }

    if (!channelIds.length) {
      log('ไม่พบ Forum channel ในกิลด์เลยครับ');
      process.exit(0);
    }

    log(`พบ ${channelIds.length} forum channel(s)\n`);

    for (const channelId of channelIds) {
      await backfillChannel(guild, channelId);
    }

    log('\n🎉 backfill เสร็จสมบูรณ์ครับ!');

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