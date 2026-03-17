// index.js 
require('dotenv').config();
const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { handleInterestSelect } = require('./handlers/interestSelect');
const { handleModalSubmit, handleProvinceDropdown, handleRegisterConfirm, handleDeleteLog, handleOpenRegisterModal } = require('./handlers/registerHandler');
const { handleProvinceBtn } = require('./handlers/provinceSelect');
const { getSetting, setSetting } = require('./db/settings');

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
  // index.js — แทนที่ block isButton() เดิม
  if (interaction.isButton()) {
    if (interaction.customId === 'btn_open_register_modal') return handleOpenRegisterModal(interaction);
    if (interaction.customId === 'btn_register_confirm')    return handleRegisterConfirm(interaction);
    if (interaction.customId === 'delete_log')              return handleDeleteLog(interaction);
    if (interaction.customId.startsWith('prov_btn:'))       return handleProvinceBtn(interaction);
    if (interaction.customId.startsWith('interest:') || interaction.customId.startsWith('skill:')) return handleInterestSelect(interaction);
    return;
  }
});


/*// Sticky message logic
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
    .setTitle('📋 แนะนำตัวสมาชิก อาสาประชาชน')
    .setDescription('กดปุ่มด้านล่างเพื่อแนะนำตัวหรืออัปเดตข้อมูลของคุณได้เลยครับ')
    .setColor(0x5865f3);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_open_register_modal')
      .setLabel('📋 แนะนำตัว/แก้ไขข้อมูล')
      .setStyle(ButtonStyle.Primary)
  );

  const sent = await message.channel.send({embeds: [embed], components: [row]});
  client.stickyMessages.set(message.channelId, sent.id);
});*/

async function refreshStickyMessage(channel) {
  const key = `sticky_${channel.id}`;
  const config = await getSetting(channel.guildId, key);
  
  if (!config) return; // ถ้าห้องนี้ไม่มี Key ของตัวเอง ก็จบงาน

  try {
    // 1. ลบข้อความเก่า
    const old = await channel.messages.fetch(config.message_id).catch(() => null);
    if (old) await old.delete().catch(() => null);

    // 2. ส่งใหม่ (ใช้ค่าเดิมจาก config)
    const sent = await channel.send({ 
        embeds: [new EmbedBuilder().setTitle(config.title).setDescription(config.description).setColor(config.color)],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_open_register_modal').setLabel(config.button_label).setStyle(ButtonStyle.Primary)
        )]
    });

    // 3. เซฟ ID ใหม่ทับที่เดิม (เพื่อให้รอบหน้าลบถูกตัว)
    config.message_id = sent.id;
    await setSetting(channel.guildId, key, config);
  } catch (err) { console.error('Sticky Error:', err); }
}
// ทำให้ client เรียกฟังก์ชันนี้จากไฟล์อื่นได้
client.refreshSticky = refreshStickyMessage;

// ใน index.js ส่วน messageCreate
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  // เช็คก่อนว่าห้องนี้ "อนุญาต" ให้มี Sticky (มีข้อมูลใน DB) ไหม
  const key = `sticky_${message.channel.id}`;
  const config = await getSetting(message.guildId, key);

  // ถ้ามี config (แปลว่าเคย /setup-register ไว้) ถึงจะสั่งทำงาน
  if (config && client.refreshSticky) {
      await client.refreshSticky(message.channel);
  }
});

client.login(process.env.TOKEN);

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
