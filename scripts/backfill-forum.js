#!/usr/bin/env node
// scripts/backfill-forum.js
// รัน: node scripts/backfill-forum.js --guild GUILD_ID [--channel CHANNEL_ID]
//
// backfill โพสต์ทั้งหมดใน forum channel ที่มี config เข้า MySQL + Meilisearch

require('dotenv').config();

const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const { upsertForumConfig, upsertForumPost } = require('../db/forum');
const { initMeilisearch, upsertPost, appendContent } = require('../services/meilisearch');
const pool = require('../db/index');

const args      = process.argv.slice(2);
const guildIdx  = args.indexOf('--guild');
const chanIdx   = args.indexOf('--channel');
const guildArg  = guildIdx  !== -1 ? args[guildIdx  + 1] : null;
const chanArg   = chanIdx   !== -1 ? args[chanIdx   + 1] : null;

if (!guildArg) {
  console.error('Usage: node scripts/backfill-forum.js --guild GUILD_ID [--channel CHANNEL_ID]');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function backfillChannel(guild, channelId) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel) {
    console.warn(`  ⚠️  channel ${channelId} ไม่พบใน guild`);
    return;
  }
  if (channel.type !== ChannelType.GuildForum) {
    console.warn(`  ⚠️  ${channel.name} ไม่ใช่ Forum channel (type: ${channel.type}) — ข้ามไป`);
    return;
  }
  console.log(`\n📂 ${channel.name} (${channelId})`);

  // upsert config (ไม่สร้าง dashboard — แค่ให้ค้นหาได้)
  await upsertForumConfig(guild.id, channelId, {});

  // ดึง threads ทั้งหมด (active + archived)
  const active = await channel.threads.fetchActive();
  const allThreads = [...active.threads.values()];

  // archived ดึงทีละ 100 วนจนหมด
  let before = undefined;
  while (true) {
    const archived = await channel.threads.fetchArchived({ limit: 100, before });
    allThreads.push(...archived.threads.values());
    if (!archived.hasMore) break;
    before = archived.threads.last()?.id;
    await sleep(500);
  }

  const threads = allThreads;
  console.log(`   พบ ${threads.length} threads`);

  for (const thread of threads) {
    process.stdout.write(`   • ${thread.name.slice(0, 50).padEnd(50)} `);

    const postUrl = `https://discord.com/channels/${guild.id}/${thread.id}`;
    await upsertForumPost(guild.id, channelId, {
      postId:    thread.id,
      postName:  thread.name,
      postUrl,
      authorId:  thread.ownerId ?? null,
      createdAt: new Date(thread.createdTimestamp),
    });

    // ดึง messages ทั้งหมดใน thread เพื่อ index เนื้อหา
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
      await sleep(500); // rate limit buffer
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

    console.log(`✅ (${msgCount} msgs)`);
    await sleep(200);
  }
}

client.once('ready', async () => {
  console.log(`🤖 logged in as ${client.user.tag}`);
  await initMeilisearch();

  const guild = client.guilds.cache.get(guildArg);
  if (!guild) {
    console.error(`❌ ไม่พบ guild ${guildArg}`);
    process.exit(1);
  }
  await guild.channels.fetch();

  let channelIds;
  if (chanArg) {
    channelIds = [chanArg];
  } else {
    // auto-discover ทุก GuildForum channel ในกิลด์
    channelIds = guild.channels.cache
      .filter(ch => ch.type === ChannelType.GuildForum)
      .map(ch => ch.id);
  }

  if (!channelIds.length) {
    console.log('ไม่พบ Forum channel ในกิลด์เลยครับ');
    process.exit(0);
  }

  console.log(`พบ ${channelIds.length} forum channel(s)`);

  for (const channelId of channelIds) {
    await backfillChannel(guild, channelId);
  }

  console.log('\n✅ backfill เสร็จแล้วครับ');
  await pool.end();
  process.exit(0);
});

client.login(process.env.TOKEN);
