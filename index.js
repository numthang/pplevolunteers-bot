// index.js 
require('dotenv').config({ override: true });
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
const { handleFinanceRefresh } = require('./handlers/financeDashboard');
const { handleOpenSearch, handleSearchModal, handleResultPage } = require('./handlers/forumSearch');
const { handleGogoSignup, handleGogoModal, handleGogoDMButton, handleGogoDMModal, handleGogoEventButton, handleGogoEventSelect, handleGogoEventModal, handleGogoListButton } = require('./handlers/gogoHandler');
const { handleWatermarkSelect, handleWatermarkEnhance, handleWatermarkConfirm, handleWatermarkModal } = require('./handlers/watermarkHandler');
const { handleQuoteModal, handleQuoteStyleSelect, handleQuoteColorSelect, handleQuoteCropSelect, handleQuoteWatermarkSelect, handleQuoteConfirm } = require('./handlers/quoteHandler');
const { handleBasketAiStart, handleBasketAiModeSelect, handleBasketAiCustomModal, handleBasketAiReplace, handleBasketAiReplaceModal, handleBasketAiAppend, handleBasketAiAppendModal } = require('./handlers/basketAiHandler');
const { handleAiThreadModeSelect, handleAiThreadCustomModal, handleAiThreadAddCaption, handleAiThreadPublic } = require('./handlers/aiThreadHandler');
const {
  handleBasketView, handleBasketClear,
  handleBasketPost, handleBasketRetry, handleBasketSelect, handleBasketModal,
  handleBasketEditCaption, handleBasketCaptionEditModal,
  handleBasketViewPublic,
} = require('./handlers/basketHandler');
const { indexThread, indexMessage, hybridSearch } = require('./services/forumIndexer');
const { buildSearchResultEmbed, buildSearchComponents } = require('./handlers/forumSearch');
const { forumChannelCache, dashboardThreadCache, addForumChannel, addDashboardThread } = require('./services/forumCache');
const { getAllForumConfigs, deleteForumPost } = require('./db/forum');
const { deletePost } = require('./services/meilisearch');
const { initMeilisearch } = require('./services/meilisearch')
const emailPoller = require('./services/emailPoller');
const smsWebhook  = require('./services/smsWebhook');
const { upsertGuilds } = require('./db/guilds');
const { syncGuildRolesCatalog, upsertGuildRole, deleteGuildRole } = require('./db/guildRoles');
const { handleSlipMessage } = require('./services/financeOCR');

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
  await upsertGuilds(client.guilds.cache);
  emailPoller.init(client);
  smsWebhook.init(client);
  // โหลด forum configs + sync role catalog ทุก guild ที่ bot อยู่
  for (const guild of client.guilds.cache.values()) {
    const synced = await syncGuildRolesCatalog(guild).catch(e => { console.error(`⚠️ role sync ${guild.id}:`, e.message); return 0; });
    if (synced) console.log(`  🔄 ${synced} roles → dc_guild_roles (${guild.name})`);
    const configs = await getAllForumConfigs(guild.id).catch(() => []);
    if (configs.length) {
      forumChannelCache.set(guild.id, new Set(configs.map(c => c.channel_id)));
      const dashboardIds = configs.map(c => c.dashboard_msg_id).filter(Boolean);
      if (dashboardIds.length) dashboardThreadCache.set(guild.id, new Set(dashboardIds));
    }
  }
});

// keep dc_guild_roles catalog สดอัตโนมัติ (เพิ่ม/แก้ชื่อ/ลบ role ใน Discord) — ไม่แตะ policy
client.on('roleCreate', role => upsertGuildRole(role).catch(e => console.error('roleCreate sync:', e.message)));
client.on('roleUpdate', (_oldRole, newRole) => upsertGuildRole(newRole).catch(e => console.error('roleUpdate sync:', e.message)));
client.on('roleDelete', role => deleteGuildRole(role).catch(e => console.error('roleDelete sync:', e.message)));

client.on('interactionCreate', async (interaction) => {
  // --- Autocomplete ---
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (command?.autocomplete) await command.autocomplete(interaction);
    return;
  }
  // --- Slash Commands ---
  if (interaction.isChatInputCommand() || interaction.isUserContextMenuCommand() || interaction.isMessageContextMenuCommand()) {
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
    if (interaction.customId.startsWith('modal_gogo:'))      return handleGogoModal(interaction);
    if (interaction.customId.startsWith('modal_gogo_dm:'))  return handleGogoDMModal(interaction);
    if (interaction.customId.startsWith('modal_gogo_event:')) return handleGogoEventModal(interaction);
    if (interaction.customId.startsWith('rate_submit:'))   return handleRateModalSubmit(interaction);
    if (interaction.customId.startsWith('report_submit:')) return handleReportSubmit(interaction);
    if (interaction.customId === 'wm_custom_text')          return handleWatermarkModal(interaction);
    if (interaction.customId.startsWith('quote_modal:'))    return handleQuoteModal(interaction);
    if (interaction.customId.startsWith('basket_schedule_modal'))      return handleBasketModal(interaction);
    if (interaction.customId.startsWith('basket_caption_edit_modal')) return handleBasketCaptionEditModal(interaction);
    if (interaction.customId.startsWith('basket_ai_custom:'))         return handleBasketAiCustomModal(interaction);
    if (interaction.customId.startsWith('basket_ai_replace_modal:')) return handleBasketAiReplaceModal(interaction);
    if (interaction.customId.startsWith('basket_ai_append_modal:'))  return handleBasketAiAppendModal(interaction);
    if (interaction.customId.startsWith('ai_thread_custom:'))         return handleAiThreadCustomModal(interaction);
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
    if (interaction.customId === 'quote_style_select')            return handleQuoteStyleSelect(interaction);
    if (interaction.customId === 'quote_color_select')            return handleQuoteColorSelect(interaction);
    if (interaction.customId === 'quote_crop_select')             return handleQuoteCropSelect(interaction);
    if (interaction.customId === 'quote_wm_select')               return handleQuoteWatermarkSelect(interaction);
    if (interaction.customId.startsWith('orgchart_group'))           return handleOrgchartGroupSelect(interaction);
    if (interaction.customId.startsWith('orgchart_province_region')) return handleOrgchartProvinceSelect(interaction);
    if (interaction.customId.startsWith('orgchart_role'))            return handleOrgchartRoleSelect(interaction);
    if (interaction.customId.startsWith('orgchart_days'))            return handleOrgchartDaysSelect(interaction);
    if (interaction.customId.startsWith('wm_'))                 return handleWatermarkSelect(interaction);
    if (interaction.customId.startsWith('basket_wm_') || interaction.customId === 'basket_platform' || interaction.customId === 'basket_group' || interaction.customId === 'basket_enhance') { handleBasketSelect(interaction); return; }
    if (interaction.customId === 'select_gogo_event')           return handleGogoEventSelect(interaction);
    if (interaction.customId.startsWith('stat_top:'))          return handleStatTopSelect(interaction);
    if (interaction.customId.startsWith('stat_user:'))         return handleStatUserSelect(interaction);
    if (interaction.customId === 'prov_region')                return handleProvinceRegionSelect(interaction);
    if (interaction.customId === 'basket_ai_mode')             return handleBasketAiModeSelect(interaction);
    if (interaction.customId === 'ai_thread_mode')             return handleAiThreadModeSelect(interaction);
    await handleInterestSelect(interaction);   // interest/skill
    if (interaction.customId.startsWith('report_category:'))   return handleReportCategory(interaction);
    return;
  }

  // --- Buttons ---
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('quote_confirm:'))      return handleQuoteConfirm(interaction);
    if (interaction.customId === 'wm_confirm')              return handleWatermarkConfirm(interaction);
    if (interaction.customId === 'wm_enhance')              return handleWatermarkEnhance(interaction);
    if (interaction.customId.startsWith('basket_')) {
      return (async () => {
        try {
          if (interaction.customId === 'basket_view')         return await handleBasketView(interaction);
          if (interaction.customId === 'basket_post')         return await handleBasketPost(interaction);
          if (interaction.customId === 'basket_retry')        return await handleBasketRetry(interaction);
          if (interaction.customId === 'basket_clear')        return await handleBasketClear(interaction);
          if (interaction.customId === 'basket_edit_caption') return await handleBasketEditCaption(interaction);
          if (interaction.customId === 'basket_view_public')  return await handleBasketViewPublic(interaction);
          if (interaction.customId === 'basket_ai_compose')          return await handleBasketAiStart(interaction);
          if (interaction.customId.startsWith('basket_ai_replace:')) return await handleBasketAiReplace(interaction);
          if (interaction.customId.startsWith('basket_ai_append:'))  return await handleBasketAiAppend(interaction);
        } catch (err) {
          console.error('[basket button]', err);
          const msg = { content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral };
          if (interaction.replied || interaction.deferred) interaction.followUp(msg).catch(() => {});
          else interaction.reply(msg).catch(() => {});
        }
      })();
    }
    if (interaction.customId === 'btn_open_register_modal') return handleOpenRegisterModal(interaction);
    if (interaction.customId === 'btn_register_confirm')    return handleRegisterConfirm(interaction);
    if (interaction.customId === 'delete_log')              return handleDeleteLog(interaction);
    if (interaction.customId.startsWith('prov_btn:'))       return handleProvinceBtn(interaction);
    if (interaction.customId.startsWith('rate_stars:'))      return handleStarButton(interaction);
    if (interaction.customId.startsWith('ratings_page:'))    return handlePageButton(interaction);
    if (interaction.customId.startsWith('interest:') || interaction.customId.startsWith('skill:')) return handleInterestSelect(interaction);
    if (interaction.customId.startsWith('report_start:')) return handleReportStart(interaction);
    if (interaction.customId === 'btn_gogo_signup')  return handleGogoSignup(interaction);
    if (interaction.customId === 'btn_gogo_dm')      return handleGogoDMButton(interaction);
    if (interaction.customId === 'btn_gogo_event')   return handleGogoEventButton(interaction);
    if (interaction.customId === 'btn_gogo_list')    return handleGogoListButton(interaction);
    if (interaction.customId === 'btn_open_interest')         return handleOpenInterest(interaction);
    if (interaction.customId === 'btn_open_province')         return handleOpenProvince(interaction);
    if (interaction.customId === 'forum_search')              return handleOpenSearch(interaction);
    if (interaction.customId.startsWith('forum_refresh_'))    return handleRefresh(interaction);
    if (interaction.customId === 'fin_refresh_dashboard')      return handleFinanceRefresh(interaction);
    if (interaction.customId.startsWith('forum_result_'))     return handleResultPage(interaction);
    if (interaction.customId.startsWith('ai_thread_caption:')) return handleAiThreadAddCaption(interaction);
    if (interaction.customId.startsWith('ai_thread_public:'))  return handleAiThreadPublic(interaction);
    return;
  }
});

// ผูกให้ทุกไฟล์เรียกได้
client.refreshSticky = refreshSticky;
client.on('voiceStateUpdate', onVoiceStateUpdate);

client.on('guildMemberAdd', async (member) => {
  const { upsertMemberFromDiscord } = require('./db/members');
  await upsertMemberFromDiscord(member).catch(err => console.error('[memberAdd] upsert:', err));

  const { getSetting } = require('./db/settings');

  const [autoroleRaw, welcomeRaw] = await Promise.all([
    getSetting(member.guild.id, 'autorole_id').catch(() => null),
    getSetting(member.guild.id, 'welcome_dm').catch(() => null),
  ]);

  if (autoroleRaw) {
    const roleId = autoroleRaw.replace(/^"|"$/g, '');
    member.roles.add(roleId).catch(err => console.error('[memberAdd] autorole failed:', err));
  }

  if (welcomeRaw) {
    const text = (() => { try { return JSON.parse(welcomeRaw); } catch { return welcomeRaw; } })()
      .replace(/\\n/g, '\n')
      .replace(/\{user\}/g, `<@${member.id}>`);
    member.send(text).catch(err => console.error('[memberAdd] welcome DM failed:', err));
  }

  const systemChannel = member.guild.systemChannel;
  if (systemChannel) {
    const stickyKey = `sticky_${systemChannel.id}`;
    const stickyRaw = await getSetting(member.guild.id, stickyKey).catch(() => null);
    if (stickyRaw) {
      let parsed = stickyRaw;
      if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { parsed = null; } }
      if (parsed) {
        const refreshMs = (parsed.refresh_minutes ?? 1440) * 60 * 1000;
        const now = Date.now();
        const last = cooldowns.get(systemChannel.id) || 0;
        if (now - last >= refreshMs) {
          cooldowns.set(systemChannel.id, now);
          refreshSticky(systemChannel).catch(err => console.error('[memberAdd] sticky:', err));
        }
      }
    }
  }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const { upsertMemberFromDiscord } = require('./db/members');
  await upsertMemberFromDiscord(newMember).catch(err => console.error('[memberUpdate] upsert:', err));
});

// ─── Forum indexing ──────────────────────────────────────────────────────────
// forumChannelCache และ dashboardThreadCache import มาจาก services/forumCache.js

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
  addForumChannel(thread.guildId, thread.parentId);
});

// Cooldown map per channel
const cooldowns = new Map();
const msgCounts = new Map();

client.on('messageCreate', async (message) => {
  // track activity (ไม่ block bot message เพราะ onMessage เช็คเองอยู่แล้ว)
  onMessage(message).catch(err => console.error('[onMessage]', err));

  // slip OCR — อ่านสลิปใน finance thread
  handleSlipMessage(message).catch(err => console.error('[financeOCR]', err));

  // forum — จัดการ message ใน forum threads ที่ setup ไว้
  if (message.channel.isThread() && message.channel.parentId && !message.author.bot) {
    const isDashboard = dashboardThreadCache.get(message.guildId)?.has(message.channel.id);

    if (isDashboard && message.content?.trim()) {
      // auto-search: ลบ message ของ user แล้วแสดงผลการค้นหา
      const keyword    = message.content.trim();
      const channelId  = message.channel.parentId;
      await message.delete().catch(() => {});
      const results    = await hybridSearch(keyword, { guildId: message.guildId, channelId });
      const totalPages = Math.max(1, Math.ceil(results.length / 10));
      const embed      = buildSearchResultEmbed(results.slice(0, 10), { keyword, page: 1, totalPages, channelId, sort: 'relevant' });
      const components = buildSearchComponents({ channelId, sort: 'relevant', page: 1, totalPages });
      await message.channel.send({ embeds: [embed], components }).catch(err =>
        console.error('[forumSearch] auto-search send:', err)
      );
      return;
    }

    const forumIds = forumChannelCache.get(message.guildId);
    if (forumIds?.has(message.channel.parentId) && !isDashboard) {
      indexMessage(message, message.channel.id).catch(err =>
        console.error('[forumIndex] messageCreate:', err)
      );
    }
  }

  if (!message.guild || (message.author.bot && message.channel.id !== client.logChannel?.id)) return;

  const key = `sticky_${message.channel.id}`;
  let config = await getSetting(message.guildId, key);
  if (!config) return;
  if (typeof config === 'string') { try { config = JSON.parse(config); } catch { return; } }

  const refreshMs = (config.refresh_minutes ?? 1440) * 60 * 1000;
  const refreshEvery = config.refresh_every ?? 5;
  const now = Date.now();
  const last = cooldowns.get(message.channel.id) || 0;
  const count = (msgCounts.get(message.channel.id) || 0) + 1;

  const timeReady  = now - last >= refreshMs;
  const countReady = count >= refreshEvery;

  if (!timeReady && !countReady) {
    msgCounts.set(message.channel.id, count);
    return;
  }

  cooldowns.set(message.channel.id, now);
  msgCounts.set(message.channel.id, 0);
  await refreshSticky(message.channel);
});

client.login(process.env.DISCORD_BOT_TOKEN);

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});