/**
 * One-time sync: fetch all guild members from Discord → upsert into dc_members
 * Run: node scripts/sync-discord-members.js
 */

require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { upsertMemberFromDiscord } = require('../db/members');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const guildId = process.env.GUILD_ID;
  const guild = await client.guilds.fetch(guildId);
  const members = await guild.members.fetch();

  const humans = [...members.values()].filter(m => !m.user.bot)
  const total = humans.length
  console.log(`Fetched ${members.size} members (${total} non-bot), upserting...`);

  let done = 0, errors = 0;
  for (const member of humans) {
    try {
      await upsertMemberFromDiscord(member);
      done++;
    } catch (err) {
      console.error(`  ✗ ${member.user.username}: ${err.message}`);
      errors++;
    }
    if ((done + errors) % 10 === 0 || done + errors === total) {
      process.stdout.write(`\r  ${done + errors}/${total} (${errors} errors)`)
    }
  }

  console.log(`\nDone: ${done} upserted, ${errors} errors`);
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);
