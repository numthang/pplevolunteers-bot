#!/usr/bin/env node
// scripts/backfill-forum.js
// รัน: node scripts/backfill-forum.js --guild GUILD_ID [--channel CHANNEL_ID]
//
// backfill โพสต์ทั้งหมดใน forum channel ที่มี config เข้า MySQL + Meilisearch

require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const { getAllForumConfigs, upsertForumPost } = require('../db/forum');
const { initMeilisearch, upsertPost, appendContent } = require('../services/meilisearch');
const pool = require('../db/index');

const args      = process.argv.slice(2);
const guildArg  = args[args.indexOf('--guild')   + 1];
const chanArg   = args[args.indexOf('--channel')  + 1] || null;

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
  console.log(`\n📂 ${channel.name} (${channelId})`);

  // ดึง threads ทั้งหมด (active + archived)
  const [active, archived] = await Promise.all([
    channel.threads.fetchActive(),
    channel.threads.fetchArchived({ limit: 100 }),
  ]);
  const threads = [...active.threads.values(), ...archived.threads.values()];
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
    const configs = await getAllForumConfigs(guildArg);
    channelIds = configs.map(c => c.channel_id);
  }

  if (!channelIds.length) {
    console.log('ไม่มี forum channel ที่ setup ไว้เลยครับ ใช้ /panel forum ก่อน');
    process.exit(0);
  }

  for (const channelId of channelIds) {
    await backfillChannel(guild, channelId);
  }

  console.log('\n✅ backfill เสร็จแล้วครับ');
  await pool.end();
  process.exit(0);
});

client.login(process.env.TOKEN);
