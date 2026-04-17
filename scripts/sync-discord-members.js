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

  console.log(`Fetched ${members.size} members, upserting...`);

  let done = 0, errors = 0;
  for (const [, member] of members) {
    if (member.user.bot) continue;
    try {
      await upsertMemberFromDiscord(member);
      done++;
    } catch (err) {
      console.error(`Error upserting ${member.user.username}:`, err.message);
      errors++;
    }
  }

  console.log(`Done: ${done} upserted, ${errors} errors`);
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
