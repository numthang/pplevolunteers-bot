// index.js 
require('dotenv').config();
const { Client, GatewayIntentBits, Collection, MessageFlags } = require('discord.js');
const { handleInterestSelect } = require('./handlers/interestSelect');
const { handleModalSubmit, handleRegisterConfirm, handleDeleteLog, handleOpenRegisterModal } = require('./handlers/registerHandler');
const { handleProvinceBtn, handleProvinceRegionSelect } = require('./handlers/provinceSelect');
const { handleStarButton, handleModalSubmit: handleRateModalSubmit } = require('./handlers/rateStars');
const { handlePageButton } = require('./handlers/ratingPage');
const { getSetting } = require('./db/settings');
const { refreshSticky } = require('./handlers/stickyHandler');
const { handleReportStart, handleReportCategory, handleReportSubmit } = require('./handlers/reportHandler');
const { handleOpenInterest } = require('./handlers/openInterest');
const { handleOpenProvince } = require('./handlers/openProvince');
const {
  handleOrgchartGroupSelect,
  handleOrgchartProvinceSelect,
  handleOrgchartRoleSelect,
  handleOrgchartDaysSelect,
} = require('./handlers/orgchartPanelHandler');
const { handleStatTopSelect, handleStatUserSelect } = require('./handlers/statHandler');
const { onMessage, onVoiceStateUpdate } = require('./utils/activityTracker');
const { handleRefresh } = require('./handlers/forumDashboard');
const { handleOpenSearch, handleSearchModal, handleResultPage } = require('./handlers/forumSearch');
const { indexThread, indexMessage } = require('./services/forumIndexer');
const { getAllForumConfigs, deleteForumPost } = require('./db/forum');
const { deletePost } = require('./services/meilisearch');
const { initMeilisearch } = require('./services/meilisearch')
const emailPoller = require('./services/emailPoller');

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

client.once('clientReady', async () => {
  console.log(`🤖 Bot พร้อมแล้ว! ${client.user.tag}`);
  await initMeilisearch();
  emailPoller.init(client);
  // โหลด forum configs ทุก guild ที่ bot อยู่
  for (const guild of client.guilds.cache.values()) {
    const configs = await getAllForumConfigs(guild.id).catch(() => []);
    if (configs.length) {
      forumChannelCache.set(guild.id, new Set(configs.map(c => c.channel_id)));
    }
  }
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
      if (interaction.replied || interaction.deferred) {
        interaction.followUp(msg).catch(() => {});
      } else {
        interaction.reply(msg).catch(() => {});
      }
    }
    return;
  }

  // --- Modal Submit ---
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'forum_search_modal')     return handleSearchModal(interaction);
    if (interaction.customId.startsWith('rate_submit:'))   return handleRateModalSubmit(interaction);
    if (interaction.customId.startsWith('report_submit:')) return handleReportSubmit(interaction);
    if (interaction.customId.startsWith('anon_submit:')) {
      const channelId = interaction.customId.split(':')[1];
      const text      = interaction.fields.getTextInputValue('anon_text');
      const channel   = interaction.guild.channels.cache.get(channelId);
      if (channel) await channel.send(text);
      await interaction.deferUpdate().catch(() => {});
    }
    return handleModalSubmit(interaction); // register modal
  }

  // --- Select Menus ---
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('orgchart_group'))           return handleOrgchartGroupSelect(interaction);
    if (interaction.customId.startsWith('orgchart_province_region')) return handleOrgchartProvinceSelect(interaction);
    if (interaction.customId.startsWith('orgchart_role'))            return handleOrgchartRoleSelect(interaction);
    if (interaction.customId.startsWith('orgchart_days'))            return handleOrgchartDaysSelect(interaction);
    if (interaction.customId.startsWith('stat_top:'))          return handleStatTopSelect(interaction);
    if (interaction.customId.startsWith('stat_user:'))         return handleStatUserSelect(interaction);
    if (interaction.customId === 'prov_region')                return handleProvinceRegionSelect(interaction);
    await handleInterestSelect(interaction);   // interest/skill
    if (interaction.customId.startsWith('report_category:'))   return handleReportCategory(interaction);
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
    if (interaction.customId === 'btn_open_interest')         return handleOpenInterest(interaction);
    if (interaction.customId === 'btn_open_province')         return handleOpenProvince(interaction);
    if (interaction.customId === 'forum_search')              return handleOpenSearch(interaction);
    if (interaction.customId.startsWith('forum_refresh_'))    return handleRefresh(interaction);
    if (interaction.customId.startsWith('forum_result_'))     return handleResultPage(interaction);
    return;
  }
});

// ผูกให้ทุกไฟล์เรียกได้
client.refreshSticky = refreshSticky;
client.on('voiceStateUpdate', onVoiceStateUpdate);

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (oldMember.roles.cache.size === newMember.roles.cache.size) return;
  const { syncMemberRoles } = require('./db/members');
  await syncMemberRoles(newMember).catch(err => console.error('[memberUpdate] syncRoles:', err));
});

// ─── Forum indexing ──────────────────────────────────────────────────────────
// cache ของ forum channel IDs ที่ setup ไว้ (reload เมื่อ bot start)
const forumChannelCache = new Map(); // guildId → Set<channelId>

client.on('threadDelete', async (thread) => {
  if (!thread.parentId) return;
  const forumIds = forumChannelCache.get(thread.guildId);
  if (!forumIds?.has(thread.parentId)) return;
  await deleteForumPost(thread.id).catch(err => console.error('[forumIndex] threadDelete DB:', err));
  await deletePost(thread.id).catch(err => console.error('[forumIndex] threadDelete meili:', err));
});

client.on('threadCreate', async (thread) => {
  if (!thread.parentId) return;
  const forumIds = forumChannelCache.get(thread.guildId);
  if (!forumIds?.has(thread.parentId)) return;
  await indexThread(thread, thread.guildId, thread.parentId).catch(err =>
    console.error('[forumIndex] threadCreate:', err)
  );
  // อัปเดต cache ถ้ามี config ใหม่
  forumChannelCache.set(thread.guildId, new Set([...(forumIds ?? []), thread.parentId]));
});

// Cooldown map per channel
const cooldowns = new Map();

client.on('messageCreate', async (message) => {
  // track activity (ไม่ block bot message เพราะ onMessage เช็คเองอยู่แล้ว)
  onMessage(message).catch(err => console.error('[onMessage]', err));

  // forum indexing — index message เข้า Meilisearch ถ้าอยู่ใน forum thread ที่ setup ไว้
  if (message.channel.isThread() && message.channel.parentId && !message.author.bot) {
    const forumIds = forumChannelCache.get(message.guildId);
    if (forumIds?.has(message.channel.parentId)) {
      indexMessage(message, message.channel.id).catch(err =>
        console.error('[forumIndex] messageCreate:', err)
      );
    }
  }

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

client.login(process.env.DISCORD_BOT_TOKEN);

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});