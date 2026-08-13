// commands/panel.js
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const { getSetting, setSetting, deleteSetting } = require('../db/settings');
const { parseSetting } = require('../utils/parseSetting');
const { getT } = require('../services/i18n');
const { DEFAULT_KEYWORDS } = require('../config/newsWatch');

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

    // --- gogo ---
    .addSubcommand(sub =>
      sub.setName('gogo')
        .setDescription('สร้าง panel ลงชื่อสนใจเข้าร่วมกิจกรรม')
        .addStringOption(o => o.setName('title').setDescription('ชื่อกิจกรรม (default: ชื่อ channel/thread)').setRequired(false))
        .addStringOption(o => o.setName('color').setDescription('สี hex').setRequired(false))
        .addBooleanOption(o => o.setName('sticky').setDescription('ให้ panel เลื่อนลงอัตโนมัติเมื่อมีคนลงชื่อ (default: true)').setRequired(false))
        .addIntegerOption(o => o.setName('refresh').setDescription('ความถี่ refresh sticky (นาที, default: 1440 = 24 ชม.)').setRequired(false).setMinValue(1))
        .addStringOption(o => o.setName('calendar_id').setDescription('Google Calendar ID สำหรับปุ่ม Add to Calendar (บันทึกต่อ server)').setRequired(false))
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
        .addBooleanOption(o => o.setName('province_select').setDescription('ให้เลือกจังหวัดหลัง register (ไม่ระบุ = ค่าเดิม, เริ่มต้น: ปิด)').setRequired(false))
        .addBooleanOption(o => o.setName('interest_select').setDescription('ให้เลือก interest/skill หลัง register (ไม่ระบุ = ค่าเดิม, เริ่มต้น: ปิด)').setRequired(false))
        .addRoleOption(o => o.setName('member_role').setDescription('ยศที่ติดให้อัตโนมัติหลัง register').setRequired(false))
        .addBooleanOption(o => o.setName('verify_phone').setDescription('ปุ่มยืนยันเบอร์ด้วย SMS OTP (เริ่มต้น: เปิด)').setRequired(false))
        .addBooleanOption(o => o.setName('bind_email').setDescription('ปุ่มผูกอีเมล — OTP ทางเมล เข้าเว็บด้วยอีเมล/Google ได้ (เริ่มต้น: เปิด)').setRequired(false))
    )

    // --- search channel ---
    .addSubcommand(sub =>
      sub.setName('search')
        .setDescription('ตั้งค่า channel สำหรับค้นหากระทู้ + thread ทุกช่อง (Moderator)')
        .addChannelOption(opt =>
          opt.setName('channel').setDescription('channel ที่ใช้เป็นห้องค้นหา').setRequired(false)
            .addChannelTypes(ChannelType.GuildText)
        )
        .addBooleanOption(o => o.setName('stop').setDescription('ปิด search channel').setRequired(false))
    )

    // --- case (เรื่องร้องเรียน) ---
    .addSubcommand(sub =>
      sub.setName('case')
        .setDescription('ตั้งค่าห้อง forum สำหรับเรื่องร้องเรียน (1 เคส = 1 กระทู้)')
        .addChannelOption(opt =>
          opt.setName('channel').setDescription('forum channel สำหรับสร้างกระทู้เคส').setRequired(true)
            .addChannelTypes(ChannelType.GuildForum)
        )
    )

    // --- handraise ---
    .addSubcommand(sub =>
      sub.setName('handraise')
        .setDescription('เปิดคิวยกมือขอพูดสำหรับ Voice Channel ที่คุณอยู่')
    )

    // --- email (ผูกอีเมลเข้าบัญชี Discord) ---
    .addSubcommand(sub =>
      sub.setName('email')
        .setDescription('วางปุ่มให้สมาชิกผูกอีเมลกับบัญชี Discord (กันบัญชีแตกเป็น 2 ใบตอน login เว็บ)')
        .addStringOption(o => o.setName('title').setDescription('หัวข้อ embed').setRequired(false))
        .addStringOption(o => o.setName('description').setDescription('ข้อความ embed (ใช้ \\n)').setRequired(false))
        .addStringOption(o => o.setName('button_label').setDescription('ข้อความปุ่ม').setRequired(false))
        .addStringOption(o => o.setName('color').setDescription('สี hex').setRequired(false))
    )

    // --- news (สรุปข่าวในพื้นที่จาก Google News RSS) ---
    .addSubcommand(sub =>
      sub.setName('news')
        .setDescription('ตั้งห้องรับสรุปข่าวในพื้นที่ วันละ 2 รอบ 8:00/17:00 (Manage Channels)')
        .addChannelOption(o =>
          o.setName('channel').setDescription('ปลายทาง: ห้องแชท / เธรด / ห้อง Forum (Forum = แยกกระทู้ทุกรอบ)').setRequired(true)
            .addChannelTypes(
              ChannelType.GuildText, ChannelType.GuildAnnouncement,
              ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread,
              ChannelType.GuildForum,
            )
        )
        .addStringOption(o =>
          o.setName('keywords')
            .setDescription('คำค้น คั่นด้วย , (ไม่ระบุ = ใช้ค่าเริ่มต้น: ราชบุรี + ชื่ออำเภอ)')
            .setRequired(false)
        )
        .addBooleanOption(o =>
          o.setName('stop')
            .setDescription('หยุดส่งข่าวลงห้องนี้ (เอาชุดนี้ออก)')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub      = interaction.options.getSubcommand();
    const isPublic  = interaction.options.getBoolean('public') ?? false;
    const replyFlag = isPublic ? undefined : MessageFlags.Ephemeral;

    // ================================================================
    // ข่าวในพื้นที่ — ผูกห้อง + วาง panel ที่มีปุ่มดึงเดี๋ยวนี้
    if (sub === 'news') {
      const t = await getT(interaction.guildId);
      // ⚠️ /panel ทั้งคำสั่งไม่มี setDefaultMemberPermissions (ต่างจาก sticky/role/channel)
      //    subcommand นี้เขียน config ของ guild → กันสิทธิ์ตรงนี้เอง
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ content: t('newsWatch.noPermission'), flags: MessageFlags.Ephemeral });
      }

      const channel  = interaction.options.getChannel('channel');
      const rawKw    = interaction.options.getString('keywords');
      const keywords = rawKw
        ? rawKw.split(',').map(s => s.trim()).filter(Boolean)
        : DEFAULT_KEYWORDS;

      // 1 ปลายทาง = 1 ชุดคำค้น — ตั้งซ้ำที่เดิมคือ "แก้ชุดเดิม" ไม่ใช่เพิ่มชุดใหม่
      const prev  = await getSetting(interaction.guildId, 'news_watch_feeds');
      const rest  = (Array.isArray(prev) ? prev : []).filter(f => f?.channelId && f.channelId !== channel.id);

      // หยุดส่งลงห้องนี้ — เอาชุดออกจากรายการ
      // ⚠️ ไม่ลบแถวใน news_watch_seen ทิ้ง เพราะถ้าเปิดใหม่อีกทีจะได้ไม่ยิงข่าวเก่าซ้ำรวดเดียว
      //    (แถวเก่าหลุดเองด้วย pruneSeen 30 วัน) · panel เดิมค้างอยู่ในห้อง ลบเองได้ ปุ่มจะตอบว่ายังไม่ได้ตั้งค่า
      if (interaction.options.getBoolean('stop')) {
        const existed = (Array.isArray(prev) ? prev : []).some(f => f?.channelId === channel.id);
        await setSetting(interaction.guildId, 'news_watch_feeds', rest);
        return interaction.reply({
          content: existed
            ? t('newsWatch.stopped', { channel: `<#${channel.id}>`, count: rest.length })
            : t('newsWatch.stopNotFound', { channel: `<#${channel.id}>` }),
          flags: MessageFlags.Ephemeral,
        });
      }

      const feeds = [...rest, { channelId: channel.id, keywords }];
      await setSetting(interaction.guildId, 'news_watch_feeds', feeds);

      const embed = new EmbedBuilder()
        .setTitle(t('newsWatch.panelTitle'))
        .setDescription(t('newsWatch.panelDescription'))
        .addFields({ name: t('newsWatch.panelKeywords'), value: keywords.map(k => `• ${k}`).join('\n').slice(0, 1024) })
        .setColor(0xff6a13);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_newswatch_run')
          .setLabel(t('newsWatch.runButton'))
          .setStyle(ButtonStyle.Primary)
      );

      // ห้อง Forum รับข้อความลอยๆ ไม่ได้ → วาง panel ไว้ห้องที่พิมพ์คำสั่งแทน
      const panelTarget = channel.type === ChannelType.GuildForum ? interaction.channel : channel;
      let placedElsewhere = false;
      try {
        await panelTarget.send({ embeds: [embed], components: [row] });
        placedElsewhere = panelTarget.id !== channel.id;
      } catch (err) {
        // วาง panel ไม่ได้ ไม่ถือว่าตั้งค่าล้ม — feed บันทึกไปแล้ว รอบถัดไปยังส่งปกติ
        console.error('[newsWatch] วาง panel ไม่สำเร็จ:', err.message);
      }

      const done = t('newsWatch.setupDone', { channel: `<#${channel.id}>`, count: feeds.length });
      return interaction.reply({
        content: placedElsewhere ? `${done}\n${t('newsWatch.panelElsewhere')}` : done,
        flags: MessageFlags.Ephemeral,
      });
    }

    // ================================================================
    // ผูกอีเมล — ประกาศครั้งเดียวถึงทุกคนในเซิร์ฟเวอร์ แทนการไล่ใส่อีเมลให้ทีละคนเอง
    if (sub === 'email') {
      const title       = interaction.options.getString('title') ?? '📧 ผูกอีเมลกับบัญชีของคุณ';
      const description = (interaction.options.getString('description')
        ?? 'ผูกอีเมลไว้ เพื่อให้เข้าเว็บด้วยอีเมลหรือ Google ได้โดยยศและสิทธิ์เดิมยังอยู่ครบ\n\nถ้าไม่ผูกไว้ แล้วไป login เว็บด้วยอีเมล ระบบจะนับว่าเป็นคนใหม่ ทำให้เห็นหน้าเปล่า'
      ).replace(/\\n/g, '\n');
      const buttonLabel = interaction.options.getString('button_label') ?? '📧 ผูกอีเมล';
      const color       = interaction.options.getString('color')
        ? parseInt(interaction.options.getString('color').replace('#', ''), 16)
        : 0xff6a13;

      const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
      const row   = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_open_email_modal')
          .setLabel(buttonLabel)
          .setStyle(ButtonStyle.Primary)
      );
      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: '✅ วาง panel ผูกอีเมลแล้ว', flags: MessageFlags.Ephemeral });
    }

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
      const { addForumChannel, addDashboardThread } = require('../services/forumCache');

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
      addForumChannel(interaction.guildId, channelOpt.id);
      addDashboardThread(interaction.guildId, thread.id);
      return interaction.editReply({ content: `✅ สร้าง dashboard thread ใน <#${channelOpt.id}> แล้วครับ` });
    }

    // ================================================================
    if (sub === 'finance-list') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const pool = require('../db/index')
      // finance_accounts เป็น org-scope แล้ว — แปลง guild ของ interaction เป็น org ก่อน query
      const { orgIdOfGuild } = require('../db/org')
      const { rows: accounts } = await pool.query(
        `SELECT id, name, bank, account_no, visibility, owner_id FROM finance_accounts WHERE org_id = $1 ORDER BY visibility, name`,
        [await orgIdOfGuild(interaction.guildId)]
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

      // ถ้ามี thread เดิมอยู่แล้ว → ตรวจว่า account_ids เปลี่ยนไหม
      const existing = await getFinanceConfig(interaction.guildId)
      if (existing?.thread_id && existing?.dashboard_msg_id) {
        const thread = await interaction.guild.channels.fetch(existing.thread_id).catch(() => null)
        if (thread) {
          const prevIds = existing.account_ids ? existing.account_ids.split(',').map(Number) : []
          const ids = accountIds.length ? accountIds : prevIds

await refreshDashboard(thread, interaction.guildId, ids, existing.dashboard_msg_id)
          await upsertFinanceConfig(interaction.guildId, {
            channel_id:  channelOpt?.id || existing.channel_id,
            account_ids: ids.length ? ids : null,
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
    if (sub === 'case') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const channelOpt = interaction.options.getChannel('channel')
      if (channelOpt.type !== ChannelType.GuildForum) {
        return interaction.editReply({ content: '❌ กรุณาเลือก **forum channel** เท่านั้น (เคสจะถูกสร้างเป็นกระทู้)' })
      }
      const { upsertCaseConfig } = require('../db/case')
      await upsertCaseConfig(interaction.guildId, { forum_channel_id: channelOpt.id })
      return interaction.editReply({ content: `✅ ตั้งค่าห้องเรื่องร้องเรียนเป็น <#${channelOpt.id}> แล้ว — เคสใหม่จะสร้างเป็นกระทู้ในห้องนี้` })
    }

    // ================================================================
    if (sub === 'gogo') {
      const color      = interaction.options.getString('color')
        ? parseInt(interaction.options.getString('color').replace('#', ''), 16)
        : 0xff6a13;
      const isSticky        = interaction.options.getBoolean('sticky') ?? true;
      const refreshMinutes  = interaction.options.getInteger('refresh') ?? 1440;
      const title           = interaction.options.getString('title') ?? interaction.channel.name;
      const calendarId      = interaction.options.getString('calendar_id');
      if (calendarId) await setSetting(interaction.guildId, 'gogo_calendar_id', calendarId);

      const creatorName = interaction.member?.displayName ?? interaction.user.username;
      // session_id: key ของ roster — mint ใหม่ทุกครั้งที่สร้าง panel → roster ว่างสด, นิ่งข้าม sticky repost
      const sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const embed = new EmbedBuilder()
        .setColor(color)
        .addFields({ name: `ผู้เข้าร่วม ${title} (0 คน)`, value: '-', inline: false })
        .setFooter({ text: `สร้างโดย ${creatorName}` });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`btn_gogo_signup:${sid}`)
          .setLabel('🙋 เข้าร่วม')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('btn_gogo_event')  // ไม่แตะ roster — ไม่ต้องมี sid
          .setEmoji('🗓️')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`btn_gogo_dm:${sid}`)
          .setEmoji('📢')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`btn_gogo_list:${sid}`)
          .setEmoji('📋')
          .setStyle(ButtonStyle.Secondary),
      );

      if (isSticky) {
        // clean up old sticky message ก่อนวางใหม่
        const existingSticky = parseSetting(await getSetting(interaction.guildId, `sticky_${interaction.channelId}`), null);
        if (existingSticky?.message_id) {
          const oldMsg = await interaction.channel.messages.fetch(existingSticky.message_id).catch(() => null);
          if (oldMsg) await oldMsg.delete().catch(() => {});
        }
      }

      const sent = await interaction.channel.send({ embeds: [embed], components: [row] });

      await setSetting(interaction.guildId, `gogo_creator:${sid}`, interaction.user.id);

      if (isSticky) {
        await setSetting(interaction.guildId, `sticky_${interaction.channelId}`, {
          content:         null,
          embeds:          [embed.toJSON()],
          components:      [row.toJSON()],
          message_id:      sent.id,
          refresh_minutes: refreshMinutes,
        });
      }

      return interaction.reply({
        content: `✅ วาง panel ลงชื่อกิจกรรมเรียบร้อย${isSticky ? ' (sticky ✅)' : ''}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // ================================================================
    if (sub === 'register') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const title       = interaction.options.getString('title') ?? `📋 แนะนำตัวสมาชิก ${interaction.guild.name}`;
      const description = (interaction.options.getString('description') ?? 'กดปุ่มด้านล่างเพื่อแนะนำตัวหรืออัปเดตข้อมูลของคุณได้เลย').replace(/\\n/g, '\n');
      const buttonLabel = interaction.options.getString('button_label') ?? '📋 แนะนำตัว/แก้ไขข้อมูล';
      const color       = interaction.options.getString('color')
        ? parseInt(interaction.options.getString('color').replace('#', ''), 16)
        : 0x5865f3;
      const logChannel     = interaction.options.getChannel('log_channel') ?? interaction.channel;
      const provinceSelect = interaction.options.getBoolean('province_select');
      const interestSelect = interaction.options.getBoolean('interest_select');
      const memberRole     = interaction.options.getRole('member_role');
      const verifyPhone    = interaction.options.getBoolean('verify_phone');
      const bindEmail      = interaction.options.getBoolean('bind_email');

      const regConfig = parseSetting(await getSetting(interaction.guildId, 'config_register'));

      regConfig.log_channel_id = logChannel.id;
      if (provinceSelect !== null) regConfig.province_select = provinceSelect;
      if (interestSelect !== null) regConfig.interest_select = interestSelect;
      if (memberRole !== null) regConfig.member_role_id = memberRole.id;
      if (verifyPhone !== null) regConfig.verify_phone = verifyPhone;
      if (bindEmail !== null) regConfig.bind_email = bindEmail;

      await setSetting(interaction.guildId, 'config_register', regConfig);

      const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
      const buttons = [
        new ButtonBuilder()
          .setCustomId('btn_open_register_modal')
          .setLabel(buttonLabel)
          .setStyle(ButtonStyle.Primary),
      ];
      // default เปิดทั้งคู่ — `!== false` ไม่ใช่ truthy check เพราะ config เก่าไม่มี key นี้ (undefined = เปิด)
      // ปิดได้ด้วยการสั่ง verify_phone:false / bind_email:false ตรงๆ เท่านั้น
      if (regConfig.verify_phone !== false) {
        buttons.push(new ButtonBuilder()
          .setCustomId('btn_open_verify_modal')
          .setLabel('📱 ยืนยันเบอร์โทร')
          .setStyle(ButtonStyle.Success));
      }
      // customId เดียวกับ /panel email — ใช้ handler เดิม (handlers/emailBindHandler.js) ไม่ต้องแยก flow
      if (regConfig.bind_email !== false) {
        buttons.push(new ButtonBuilder()
          .setCustomId('btn_open_email_modal')
          .setLabel('📧 ผูกอีเมล')
          .setStyle(ButtonStyle.Primary));
      }
      const row = new ActionRowBuilder().addComponents(...buttons);

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
          `Member role → ${regConfig.member_role_id ? `<@&${regConfig.member_role_id}>` : '❌'}`,
          `Verify phone (OTP) → ${regConfig.verify_phone !== false ? '✅' : '❌'}`,
          `Bind email (OTP) → ${regConfig.bind_email !== false ? '✅' : '❌'}`,
        ].join('\n'),
      });
    }

    // ================================================================
    if (sub === 'handraise') {
      const { handleHandraiseStart } = require('../handlers/handraiseHandler');
      return handleHandraiseStart(interaction);
    }

    // ================================================================
    if (sub === 'search') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (interaction.options.getBoolean('stop')) {
        await deleteSetting(interaction.guildId, 'search_channel');
        const { clearSearchChannel } = require('../services/forumCache');
        clearSearchChannel(interaction.guildId);
        return interaction.editReply({ content: '✅ ปิด search channel แล้วครับ' });
      }
      const channelOpt = interaction.options.getChannel('channel');
      if (!channelOpt) {
        return interaction.editReply({ content: '❌ ระบุ channel ด้วยครับ (หรือใช้ stop:true เพื่อปิด)' });
      }
      await setSetting(interaction.guildId, 'search_channel', channelOpt.id);
      const { setSearchChannel } = require('../services/forumCache');
      setSearchChannel(interaction.guildId, channelOpt.id);
      return interaction.editReply({
        content: `✅ ตั้งค่า search channel เป็น <#${channelOpt.id}> แล้วครับ\nเมนชันบอทพร้อม keyword ใน channel นั้นได้เลย — ค้นข้ามทุก forum + thread`,
      });
    }
  },
};
