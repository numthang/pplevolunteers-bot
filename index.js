require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { handleInterestSelect } = require('./handlers/interestSelect');
const { handleModalSubmit, handleProvinceDropdown, handleRegisterConfirm, handleDeleteLog, handleOpenRegisterModal } = require('./handlers/registerHandler');
const { handleProvinceBtn } = require('./handlers/provinceSelect');

const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // ← เพิ่มบรรทัดนี้
    GatewayIntentBits.GuildMessages, // ← เพิ่ม
  ]
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    console.log(`✅ โหลด command: ${command.data.name}`);
  }
}

client.once('ready', () => {
  console.log(`🤖 Bot พร้อมแล้ว! ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  // --- Slash Commands ---
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(err);
      const msg = { content: '❌ เกิดข้อผิดพลาด', ephemeral: true };
      interaction.replied ? interaction.followUp(msg) : interaction.reply(msg);
    }
    return;
  }

  // --- Modal Submit ---
  if (interaction.isModalSubmit()) {
    await handleModalSubmit(interaction);
    return;
  }

  // --- Select Menus ---
  if (interaction.isStringSelectMenu()) {
    await handleProvinceDropdown(interaction); // dropdown จังหวัด (register)
    await handleInterestSelect(interaction);   // interest/skill
    return;
  }

  // --- Buttons ---
  if (interaction.isButton()) {
    await handleOpenRegisterModal(interaction); // ← เพิ่มบรรทัดนี้
    await handleRegisterConfirm(interaction);  // ปุ่มยืนยัน log
    await handleInterestSelect(interaction);   // ปุ่ม interest/skill toggle
    await handleDeleteLog(interaction);
    await handleProvinceBtn(interaction);
    return;
  }
});

// Sticky message logic
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!client.stickyMessages) return;

  const stickyId = client.stickyMessages.get(message.channelId);
  if (!stickyId) return;

  try {
    const old = await message.channel.messages.fetch(stickyId);
    await old.delete();
  } catch {}

  const {EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle} = require('discord.js');

  const embed = new EmbedBuilder()
    .setTitle('📋 ลงทะเบียนสมาชิก อาสาประชาชน')
    .setDescription('กดปุ่มด้านล่างเพื่อลงทะเบียนหรืออัปเดตข้อมูลของคุณได้เลยครับ')
    .setColor(0x5865f3);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_open_register_modal')
      .setLabel('📋 ลงทะเบียน / แก้ไขข้อมูล')
      .setStyle(ButtonStyle.Primary)
  );

  const sent = await message.channel.send({embeds: [embed], components: [row]});
  client.stickyMessages.set(message.channelId, sent.id);
});

client.login(process.env.TOKEN);

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
