require('dotenv').config();
const {Client, GatewayIntentBits} = require('discord.js');
const {createObjectCsvWriter} = require('csv-writer');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(process.env.INTRO_CHANNEL_ID);
  const messages = [];
  let lastId;

  while (true) {
    const batch = await channel.messages.fetch({limit: 100, ...(lastId && {before: lastId})});
    if (batch.size === 0) break;
    messages.push(...batch.values());
    lastId = batch.last().id;
  }

  console.log(`📦 พบ ${messages.length} messages`);

  const records = [];

  for (const msg of messages) {
    if (!msg.author.bot) continue;
    if (!msg.embeds.length) continue;

    const embed = msg.embeds[0];
    const sentBy = msg.content || '';
    const mentionMatch = sentBy.match(/<@(\d+)>/);
    const usernameMatch = sentBy.match(/\(([^)]+)\)\s*$/);
    if (!mentionMatch) continue;

    const fields = {};
    for (const f of embed.fields) {
      fields[f.name.trim()] = f.value.trim();
    }

    records.push({
      discord_id: mentionMatch[1],
      username: usernameMatch ? usernameMatch[1] : '',
      raw_name: fields['ชื่อ (เลขสมาชิกพรรค ถ้ามี)'] || '',
      nickname: fields['ชื่อเล่น'] || '',
      province_raw: fields['จังหวัด'] || '',
      specialty_raw: fields['ความสนใจและความถนัด'] || '',
      referred_by: fields['แนะนำโดย'] || '',
      registered_at: msg.createdAt.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ''),
    });
  }

  const csvWriter = createObjectCsvWriter({
    path: 'backups/intro_raw.csv',
    header: [
      {id: 'discord_id', title: 'discord_id'},
      {id: 'username', title: 'username'},
      {id: 'raw_name', title: 'raw_name'},
      {id: 'nickname', title: 'nickname'},
      {id: 'province_raw', title: 'province_raw'},
      {id: 'specialty_raw', title: 'specialty_raw'},
      {id: 'referred_by', title: 'referred_by'},
      {id: 'registered_at', title: 'registered_at'},
    ],
    encoding: 'utf8',
  });

  await csvWriter.writeRecords(records);
  console.log(`✅ Export เสร็จ: backups/intro_raw.csv (${records.length} records)`);
  process.exit(0);
});

client.login(process.env.TOKEN);