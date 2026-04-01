// index.js 
require('dotenv').config();
const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { handleInterestSelect } = require('./handlers/interestSelect');
const { handleModalSubmit, handleProvinceDropdown, handleRegisterConfirm, handleDeleteLog, handleOpenRegisterModal } = require('./handlers/registerHandler');
const { handleProvinceBtn } = require('./handlers/provinceSelect');
const { handleStarButton, handleModalSubmit: handleRateModalSubmit } = require('./handlers/rateStars');
const { handlePageButton } = require('./handlers/ratingsPage');
const { getSetting, setSetting } = require('./db/settings');
const { refreshSticky } = require('./handlers/stickyHandler');
const { handleReportStart, handleReportCategory, handleReportSubmit } = require('./handlers/reportHandler');
const { handleOpenInterest } = require('./handlers/openInterest');
const { handleOpenProvince } = require('./handlers/openProvince');
const { handleOrgchartProvinceSelect } = require('./handlers/orgchartProvinceSelect');
const { handleOrgchartRoleSelect } = require('./handlers/orgchartRoleSelect');
const { onMessage, onVoiceStateUpdate } = require('./utils/activityTracker');

const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,  // ← เพิ่มตรงนี้
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

client.once('clientReady', () => {
  console.log(`🤖 Bot พร้อมแล้ว! ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  // --- Autocomplete ---
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (command?.autocomplete) await command.autocomplete(interaction);
    return;
  }
  // --- Slash Commands ---
  if (interaction.isChatInputCommand() || interaction.isUserContextMenuCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(err);
      const msg = { content: '❌ เกิดข้อผิดพลาด', flags: MessageFlags.Ephemeral };
      interaction.replied ? interaction.followUp(msg) : interaction.reply(msg);
    }
    return;
  }

  // --- Modal Submit ---
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('rate_submit:'))   return handleRateModalSubmit(interaction);
    if (interaction.customId.startsWith('report_submit:')) return handleReportSubmit(interaction);
    return handleModalSubmit(interaction); // register modal
  }

  // --- Select Menus ---
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'orgchart_province_region') return handleOrgchartProvinceSelect(interaction);
    if (interaction.customId === 'orgchart_role')            return handleOrgchartRoleSelect(interaction);
    await handleProvinceDropdown(interaction); // dropdown จังหวัด (register)
    await handleInterestSelect(interaction);   // interest/skill
    if (interaction.customId.startsWith('report_category:')) return handleReportCategory(interaction);
    return;
  }

  // --- Buttons ---
  if (interaction.isButton()) {
    if (interaction.customId === 'btn_open_register_modal') return handleOpenRegisterModal(interaction);
    if (interaction.customId === 'btn_register_confirm')    return handleRegisterConfirm(interaction);
    if (interaction.customId === 'delete_log')              return handleDeleteLog(interaction);
    if (interaction.customId.startsWith('prov_btn:'))       return handleProvinceBtn(interaction);
    if (interaction.customId.startsWith('rate_stars:'))      return handleStarButton(interaction);
    if (interaction.customId.startsWith('ratings_page:'))    return handlePageButton(interaction);
    if (interaction.customId.startsWith('interest:') || interaction.customId.startsWith('skill:')) return handleInterestSelect(interaction);
    if (interaction.customId.startsWith('report_start:')) return handleReportStart(interaction);
    if (interaction.customId === 'btn_open_interest') return handleOpenInterest(interaction);
    if (interaction.customId === 'btn_open_province') return handleOpenProvince(interaction);
    return;
  }
});

// ผูกให้ทุกไฟล์เรียกได้
client.refreshSticky = refreshSticky;
client.on('voiceStateUpdate', onVoiceStateUpdate);

// Cooldown map per channel
const cooldowns = new Map();

client.on('messageCreate', async (message) => {
  // track activity (ไม่ block bot message เพราะ onMessage เช็คเองอยู่แล้ว)
  onMessage(message).catch(err => console.error('[onMessage]', err));
  
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