// commands/panel.js
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { getSetting, setSetting } = require('../db/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('วาง panel ต่างๆ')

    // --- interest ---
    .addSubcommand(sub =>
      sub.setName('interest')
        .setDescription('วางปุ่มเลือกความสนใจและความถนัด')
        .addStringOption(o => o.setName('title').setDescription('หัวข้อ embed').setRequired(false))
        .addStringOption(o => o.setName('description').setDescription('ข้อความ embed (ใช้ \\n)').setRequired(false))
        .addStringOption(o => o.setName('color').setDescription('สี hex').setRequired(false))
        .addBooleanOption(o => o.setName('public').setDescription('แสดงผลให้ทุกคนเห็น (default: false)').setRequired(false))
    )

    // --- province ---
    .addSubcommand(sub =>
      sub.setName('province')
        .setDescription('เปิด panel เลือกจังหวัด')
        .addBooleanOption(o => o.setName('public').setDescription('แสดงผลให้ทุกคนเห็น (default: false)').setRequired(false))
    )

    // --- orgchart ---
    .addSubcommand(sub =>
      sub.setName('orgchart')
        .setDescription('วาง orgchart panel')
        .addIntegerOption(opt =>
          opt.setName('top')
            .setDescription('จำนวน members ที่แสดง (default 10)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(25)
        )
        .addBooleanOption(o => o.setName('public').setDescription('แสดงผลให้ทุกคนเห็น (default: false)').setRequired(false))
    )

    // --- forum ---
    .addSubcommand(sub =>
      sub.setName('forum')
        .setDescription('ตั้งค่า forum channel + สร้าง dashboard (Moderator)')
        .addChannelOption(opt =>
          opt.setName('channel').setDescription('forum channel ที่ต้องการ setup').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('title').setDescription('หัวข้อ thread (default: 📋 ค้นหาโพสต์ ใน {ชื่อช่อง})').setRequired(false)
        )
        .addIntegerOption(opt =>
          opt.setName('items_per_page').setDescription('จำนวนผลต่อหน้าในการค้นหา (default: 10)').setRequired(false).setMinValue(5).setMaxValue(25)
        )
    )

    // --- finance setup ---
    .addSubcommand(sub =>
      sub.setName('finance')
        .setDescription('ตั้งค่า channel การเงิน + สร้าง thread dashboard')
        .addChannelOption(opt =>
          opt.setName('channel').setDescription('channel การเงินที่ต้องการ setup').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('accounts').setDescription('account ID คั่นด้วย comma เช่น 1,2,3 (ไม่ระบุ = ทุกบัญชี internal/public)').setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('thread_name').setDescription('ชื่อ thread (default: 📊 รายรับ-รายจ่าย)').setRequired(false)
        )
    )

    // --- finance list ---
    .addSubcommand(sub =>
      sub.setName('finance-list')
        .setDescription('แสดงรายชื่อบัญชีการเงินทั้งหมด + ID')
    )

    // --- register ---
    .addSubcommand(sub =>
      sub.setName('register')
        .setDescription('วางปุ่มแนะนำตัวสมาชิก')
        .addStringOption(o => o.setName('title').setDescription('หัวข้อ embed').setRequired(false))
        .addStringOption(o => o.setName('description').setDescription('ข้อความ embed (ใช้ \\n)').setRequired(false))
        .addStringOption(o => o.setName('button_label').setDescription('ข้อความปุ่ม').setRequired(false))
        .addStringOption(o => o.setName('color').setDescription('สี hex').setRequired(false))
        .addChannelOption(o => o.setName('log_channel').setDescription('channel ส่ง log').setRequired(false))
        .addBooleanOption(o => o.setName('province_select').setDescription('ให้เลือกจังหวัดหลัง register').setRequired(false))
        .addBooleanOption(o => o.setName('interest_select').setDescription('ให้เลือก interest/skill หลัง register').setRequired(false))
        .addBooleanOption(o => o.setName('public').setDescription('แสดงผลให้ทุกคนเห็น (default: false)').setRequired(false))
    ),

  async execute(interaction) {
    const sub      = interaction.options.getSubcommand();
    const isPublic  = interaction.options.getBoolean('public') ?? false;
    const replyFlag = isPublic ? undefined : MessageFlags.Ephemeral;

    // ================================================================
    if (sub === 'interest') {
      const title       = interaction.options.getString('title') ?? `🎯 ความสนใจ & ความถนัด · ${interaction.guild.name}`;
      const description = (interaction.options.getString('description') ?? 'กดปุ่มด้านล่างเพื่อเลือกความสนใจและความถนัดของคุณ\nสามารถเพิ่มหรือถอดได้ตลอดเวลา').replace(/\\n/g, '\n');
      const color       = interaction.options.getString('color')
        ? parseInt(interaction.options.getString('color').replace('#', ''), 16)
        : 0xf1c40f;

      const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
      const row   = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_open_interest')
          .setLabel('🎯 เลือกความสนใจ / ความถนัด')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.reply({ embeds: [embed], components: [row], flags: replyFlag });
      return interaction.followUp({ content: '✅ วาง panel เลือกความสนใจเรียบร้อยครับ', flags: MessageFlags.Ephemeral });
    }

    // ================================================================
    if (sub === 'province') {
      const title       = interaction.options.getString('title') ?? `🗺️ เลือกจังหวัด · ${interaction.guild.name}`;
      const description = (interaction.options.getString('description') ?? 'กดปุ่มด้านล่างเพื่อเลือกจังหวัดของคุณ\nสามารถเปลี่ยนได้ตลอดเวลา').replace(/\\n/g, '\n');
      const color       = interaction.options.getString('color')
        ? parseInt(interaction.options.getString('color').replace('#', ''), 16)
        : 0x3498db;

      const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
      const row   = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_open_province')
          .setLabel('🗺️ เลือกจังหวัด')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.reply({ embeds: [embed], components: [row], flags: replyFlag });
      return interaction.followUp({ content: '✅ วาง panel เลือกจังหวัดเรียบร้อยครับ', flags: MessageFlags.Ephemeral });
    }

    // ================================================================
    if (sub === 'orgchart') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const { buildPanelComponents, buildPanelEmbed } = require('../handlers/orgchartPanelHandler');
      const topN  = interaction.options.getInteger('top') ?? 10;
      const state = { group: 'main', roleId: null, regionId: null, days: 180, topN };
      const [embed, components] = await Promise.all([
        buildPanelEmbed(interaction.guild, state),
        buildPanelComponents(interaction.guildId, state),
      ]);

      await interaction.channel.send({ embeds: [embed], components });
      return interaction.editReply({ content: '✅ วาง orgchart panel แล้วครับ' });
    }

    // ================================================================
    if (sub === 'forum') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const channelOpt   = interaction.options.getChannel('channel');
      const itemsPerPage = interaction.options.getInteger('items_per_page') ?? 10;
      const forumChannel = interaction.guild.channels.cache.get(channelOpt.id);
      const threadTitle  = interaction.options.getString('title') ?? `📋 ค้นหาโพสต์ ใน ${forumChannel?.name ?? channelOpt.name}`;

      const { upsertForumConfig, setDashboardMsgId, getForumConfig } = require('../db/forum');
      const { buildDashboardEmbed } = require('../handlers/forumDashboard');

      await upsertForumConfig(interaction.guildId, channelOpt.id, { itemsPerPage });

      const existingConfig = await getForumConfig(interaction.guildId, channelOpt.id);
      const config = { items_per_page: itemsPerPage, dashboard_msg_id: null };
      const { embed, components } = await buildDashboardEmbed(interaction.guild, channelOpt.id, config);

      // ถ้ามี thread เดิมอยู่แล้ว → edit starter message
      if (existingConfig?.dashboard_msg_id) {
        const existingThread = interaction.guild.channels.cache.get(existingConfig.dashboard_msg_id);
        if (existingThread) {
          const starterMsg = await existingThread.fetchStarterMessage().catch(() => null);
          if (starterMsg) {
            await starterMsg.edit({ embeds: [embed], components });
            return interaction.editReply({ content: `✅ อัปเดต dashboard ใน <#${existingConfig.dashboard_msg_id}> แล้วครับ` });
          }
        }
      }

      // สร้าง thread ใหม่
      const thread = await forumChannel.threads.create({
        name:    threadTitle,
        message: { embeds: [embed], components },
      });
      // unpin thread เดิมก่อน (forum channel pin ได้แค่ 1 อัน)
      const pinned = await forumChannel.threads.fetchActive();
      for (const [, t] of pinned.threads) {
        if (t.pinned && t.id !== thread.id) {
          console.log('[panel forum] unpinning old thread:', t.name, t.id);
          await t.unpin().catch(e => console.error('[panel forum] unpin error:', e.message));
        }
      }
      await thread.pin().catch(e => console.error('[panel forum] pin error:', e.message));
      await setDashboardMsgId(interaction.guildId, channelOpt.id, thread.id);
      return interaction.editReply({ content: `✅ สร้าง dashboard thread ใน <#${channelOpt.id}> แล้วครับ` });
    }

    // ================================================================
    if (sub === 'finance-list') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const pool = require('../db/index')
      const [accounts] = await pool.query(
        `SELECT id, name, bank, account_no, visibility, owner_id FROM finance_accounts WHERE guild_id = ? ORDER BY visibility, name`,
        [interaction.guildId]
      )
      if (!accounts.length) return interaction.editReply({ content: 'ยังไม่มีบัญชีในระบบครับ' })

      const lines = accounts.map(a => {
        const vis = a.visibility === 'private' ? '🔒' : a.visibility === 'internal' ? '🏢' : '🌐'
        const acctNo = a.account_no ? ` \`${a.account_no}\`` : ''
        return `\`${String(a.id).padStart(3)}\` ${vis} **${a.name}**${a.bank ? ` · ${a.bank}` : ''}${acctNo}`
      })
      return interaction.editReply({ content: `**บัญชีทั้งหมด**\n${lines.join('\n')}\n\nใช้ ID ด้านบนใน \`/panel finance accounts:\`` })
    }

    // ================================================================
    if (sub === 'finance') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const channelOpt  = interaction.options.getChannel('channel')
      const accountsStr = interaction.options.getString('accounts') || ''
      const threadName  = interaction.options.getString('thread_name') || '📊 รายรับ-รายจ่าย'
      const accountIds  = accountsStr ? accountsStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : []
      const { upsertFinanceConfig, getFinanceConfig } = require('../db/finance')
      const { sendDashboard, refreshDashboard } = require('../handlers/financeDashboard')

      // ถ้ามี thread เดิมอยู่แล้ว → refresh แล้ว update account_ids
      const existing = await getFinanceConfig(interaction.guildId)
      if (existing?.thread_id && existing?.dashboard_msg_id) {
        const thread = await interaction.guild.channels.fetch(existing.thread_id).catch(() => null)
        if (thread) {
          const ids = accountIds.length ? accountIds
            : existing.account_ids ? existing.account_ids.split(',').map(Number) : []
          await refreshDashboard(thread, interaction.guildId, ids, existing.dashboard_msg_id)
          await upsertFinanceConfig(interaction.guildId, {
            channel_id:   channelOpt?.id || existing.channel_id,
            account_ids:  ids.length ? ids : null,
          })
          return interaction.editReply({ content: `✅ อัปเดต dashboard ใน <#${existing.thread_id}> แล้วครับ` })
        }
      }

      // สร้าง thread ใหม่
      const channel = interaction.guild.channels.cache.get(channelOpt.id)
        || await interaction.guild.channels.fetch(channelOpt.id)
      const thread = await channel.threads.create({ name: threadName })
      const msgIds = await sendDashboard(thread, interaction.guildId, accountIds)

      await upsertFinanceConfig(interaction.guildId, {
        channel_id:       channelOpt.id,
        thread_id:        thread.id,
        account_ids:      accountIds.length ? accountIds : null,
        dashboard_msg_id: JSON.stringify(msgIds),
      })

      return interaction.editReply({ content: `✅ สร้าง thread dashboard การเงินใน <#${channelOpt.id}> แล้วครับ` })
    }

    // ================================================================
    if (sub === 'register') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const title       = interaction.options.getString('title') ?? '📋 แนะนำตัวสมาชิก อาสาประชาชน';
      const description = (interaction.options.getString('description') ?? 'กดปุ่มด้านล่างเพื่อแนะนำตัวหรืออัปเดตข้อมูลของคุณได้เลย').replace(/\\n/g, '\n');
      const buttonLabel = interaction.options.getString('button_label') ?? '📋 แนะนำตัว/แก้ไขข้อมูล';
      const color       = interaction.options.getString('color')
        ? parseInt(interaction.options.getString('color').replace('#', ''), 16)
        : 0x5865f3;
      const logChannel     = interaction.options.getChannel('log_channel') ?? interaction.channel;
      const provinceSelect = interaction.options.getBoolean('province_select');
      const interestSelect = interaction.options.getBoolean('interest_select');

      let regConfig = await getSetting(interaction.guildId, 'config_register');
      if (typeof regConfig === 'string') {
        try { regConfig = JSON.parse(regConfig); } catch { regConfig = {}; }
      }
      regConfig = regConfig ?? {};

      regConfig.log_channel_id = logChannel.id;
      if (provinceSelect !== null) regConfig.province_select = provinceSelect;
      if (interestSelect !== null) regConfig.interest_select = interestSelect;

      await setSetting(interaction.guildId, 'config_register', regConfig);

      const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_open_register_modal')
          .setLabel(buttonLabel)
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });

      const logDisplay = regConfig.log_channel_id === interaction.channelId
        ? 'channel นี้'
        : `<#${regConfig.log_channel_id}>`;

      return interaction.editReply({
        content: [
          '✅ วาง panel แนะนำตัวเรียบร้อยครับ',
          `Log → ${logDisplay}`,
          `Province select → ${regConfig.province_select ? '✅' : '❌'}`,
          `Interest select → ${regConfig.interest_select ? '✅' : '❌'}`,
        ].join('\n'),
      });
    }
  },
};
