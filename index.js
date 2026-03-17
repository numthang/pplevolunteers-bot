// index.js 
require('dotenv').config();
const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { handleInterestSelect } = require('./handlers/interestSelect');
const { handleModalSubmit, handleProvinceDropdown, handleRegisterConfirm, handleDeleteLog, handleOpenRegisterModal } = require('./handlers/registerHandler');
const { handleProvinceBtn } = require('./handlers/provinceSelect');
const { getSetting, setSetting } = require('./db/settings');
const { refreshSticky } = require('./handlers/stickyHandler');

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

// ผูกให้ทุกไฟล์เรียกได้
client.refreshSticky = refreshSticky;

// Cooldown map per channel
const cooldowns = new Map();

client.on('messageCreate', async (message) => {
  if (!message.guild || (message.author.bot && message.channel.id !== client.logChannel?.id)) return;
  const key = `sticky_${message.channel.id}`;
  const config = await getSetting(message.guildId, key);
  if (!config) return;

  const now = Date.now();
  const last = cooldowns.get(message.channel.id) || 0;
  if (now - last < 4000) return; // 4 วินาที debounce

  cooldowns.set(message.channel.id, now);
  await refreshSticky(message.channel);
});

client.login(process.env.TOKEN);

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
