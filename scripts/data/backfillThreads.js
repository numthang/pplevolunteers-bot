/**
 * Backfill: index threads ใน text channels ทั้งหมดเข้า Meilisearch + DB
 * Run: node scripts/backfillThreads.js [guildId] [--dry-run]
 *
 * Production: sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/backfillThreads.js'
 */

require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const { indexThread } = require('../services/forumIndexer');

const DRY_RUN = process.argv.includes('--dry-run');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}${DRY_RUN ? '  (DRY-RUN)' : ''}`);

  const guildId = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.GUILD_ID;
  if (!guildId) {
    console.error('ERROR: ระบุ guild id หรือตั้งค่า GUILD_ID ใน .env');
    process.exit(1);
  }

  const guild = await client.guilds.fetch(guildId);
  console.log(`Guild: ${guild.name} (${guild.id})`);

  // fetch ทุก channel
  const channels = await guild.channels.fetch();
  const textChannels = channels.filter(c => c?.type === ChannelType.GuildText);
  console.log(`Text channels: ${textChannels.size}`);

  let totalThreads = 0;
  let indexed = 0;
  let errors = 0;

  for (const [, channel] of textChannels) {
    // ดึง active + archived threads
    const [active, archived] = await Promise.all([
      channel.threads.fetchActive().catch(() => ({ threads: new Map() })),
      channel.threads.fetchArchived({ fetchAll: true }).catch(() => ({ threads: new Map() })),
    ]);

    const threads = [...active.threads.values(), ...archived.threads.values()];
    if (!threads.length) continue;

    totalThreads += threads.length;
    process.stdout.write(`  #${channel.name}: ${threads.length} threads`);

    if (!DRY_RUN) {
      for (const thread of threads) {
        try {
          await indexThread(thread, guildId, channel.id);
          indexed++;
        } catch (err) {
          errors++;
          console.error(`\n    ❌ ${thread.name}: ${err.message}`);
        }
        process.stdout.write(`\r  #${channel.name}: ${indexed}/${totalThreads} (${errors} errors)   `);
      }
    }
    process.stdout.write('\n');
  }

  console.log(`\nDone: ${indexed} indexed, ${errors} errors (${totalThreads} total threads)`);
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);
