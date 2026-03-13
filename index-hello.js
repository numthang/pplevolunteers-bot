require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder()
    .setName('hello')
    .setDescription('ทักทาย Bot')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once('clientReady', async () => {
  console.log(`Bot พร้อมแล้ว! ${client.user.tag}`);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log('ลงทะเบียน Slash Commands แล้ว!');
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'hello') {
    const greetings = [
        `สวัสดี, ${interaction.user}! 👋`,
        `หวัดดี, ${interaction.user}! 😄`,
        `ดีจ้า, ${interaction.user}! 🎉`,
        `โอ้ ว่าไง, ${interaction.user}! 😎`,
        `ยินดีต้อนรับ, ${interaction.user}! 🙌`,
    ];
    const random = greetings[Math.floor(Math.random() * greetings.length)];
    await interaction.reply(random);
  }
});

client.login(process.env.TOKEN);