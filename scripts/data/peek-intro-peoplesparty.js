/**
 * peek-intro-peoplesparty.js
 * ดู raw messages จากห้องแนะนำตัว people party — ไม่แตะ db
 * Run: node scripts/data/peek-intro-peoplesparty.js [--limit 20]
 */

require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const GUILD_ID   = '1115613658408566844';
const CHANNEL_ID = '1115613659297751072';
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i !== -1 ? parseInt(process.argv[i + 1]) || 20 : 20;
})();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', async () => {
  console.log(`Bot: ${client.user.tag}\n`);

  const guild   = await client.guilds.fetch(GUILD_ID);
  const channel = await guild.channels.fetch(CHANNEL_ID);
  const batch   = await channel.messages.fetch({ limit: LIMIT });

  const msgs = [...batch.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  console.log(`ดึงมา ${msgs.length} messages (เรียงเก่า→ใหม่)\n`);
  console.log('═'.repeat(72));

  for (const m of msgs) {
    const ts      = m.createdAt.toISOString().slice(0, 16);
    const author  = `${m.author.username} (${m.author.id})`;
    const content = m.content || '(no text content)';
    console.log(`[${ts}] ${author}`);
    console.log(content);
    console.log('─'.repeat(72));
  }

  client.destroy();
});

client.login(process.env.DISCORD_BOT_TOKEN);
