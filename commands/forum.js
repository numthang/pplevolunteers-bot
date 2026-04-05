// commands/forum.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { buildSearchResultEmbed, buildSearchComponents } = require('../handlers/forumSearch');
const { buildDashboardEmbed, buildDashboardComponents } = require('../handlers/forumDashboard');
const { getForumConfig, setDashboardMsgId } = require('../db/forum');
const { hybridSearch } = require('../services/forumIndexer');

const ITEMS_PER_PAGE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('forum')
    .setDescription('ค้นหาโพสต์ใน forum channel')

    // --- search ---
    .addSubcommand(sub =>
      sub.setName('search')
        .setDescription('ค้นหาโพสต์')
        .addStringOption(opt =>
          opt.setName('keyword')
            .setDescription('คำค้นหา (ว่างไว้ = ดูทั้งหมดเรียงล่าสุด)')
            .setRequired(false)
        )
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('ค้นเฉพาะช่องนี้ (ว่างไว้ = ค้นทุกช่อง)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('sort')
            .setDescription('เรียงผลลัพธ์ (default: relevant ถ้ามี keyword, newest ถ้าไม่มี)')
            .setRequired(false)
            .addChoices(
              { name: 'เกี่ยวข้องมากสุด', value: 'relevant' },
              { name: 'ล่าสุด',            value: 'newest'   },
              { name: 'เก่าสุด',           value: 'oldest'   },
            )
        )
        .addBooleanOption(opt =>
          opt.setName('public')
            .setDescription('แสดงให้ทุกคนเห็น (default: เฉพาะคุณ)')
            .setRequired(false)
        )
    )

    // --- refresh ---
    .addSubcommand(sub =>
      sub.setName('refresh')
        .setDescription('รีเฟรช dashboard ของ forum channel')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('forum channel ที่ต้องการรีเฟรช')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ================================================================
    if (sub === 'search') {
      const keyword   = interaction.options.getString('keyword')?.trim() ?? '';
      const channel   = interaction.options.getChannel('channel');
      const channelId = channel?.id ?? null;
      const isPublic  = interaction.options.getBoolean('public') ?? false;
      const sortOpt   = interaction.options.getString('sort') ?? (keyword ? 'relevant' : 'newest');

      await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });

      let results = await hybridSearch(keyword || '', { guildId: interaction.guildId, channelId });

      // sort override
      if (sortOpt === 'newest') {
        results.sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0));
      } else if (sortOpt === 'oldest') {
        results.sort((a, b) => new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0));
      }
      // 'relevant' ใช้ order จาก hybridSearch เลย

      const page       = 1;
      const totalPages = Math.max(1, Math.ceil(results.length / ITEMS_PER_PAGE));
      const slice      = results.slice(0, ITEMS_PER_PAGE);

      const embed      = buildSearchResultEmbed(slice, { keyword, page, totalPages, channelId, sort: sortOpt });
      const components = buildSearchComponents({ keyword, channelId, sort: sortOpt, page, totalPages });

      return interaction.editReply({ embeds: [embed], components });
    }

    // ================================================================
    if (sub === 'refresh') {
      const channel = interaction.options.getChannel('channel');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const config = await getForumConfig(interaction.guildId, channel.id);
      if (!config) {
        return interaction.editReply({ content: `❌ ยังไม่ได้ setup forum channel <#${channel.id}> ครับ ใช้ \`/panel forum\` ก่อน` });
      }

      const { embed, components } = await buildDashboardEmbed(interaction.guild, channel.id, config);

      if (config.dashboard_msg_id) {
        try {
          const msg = await channel.messages.fetch(config.dashboard_msg_id);
          await msg.edit({ embeds: [embed], components });
          return interaction.editReply({ content: '✅ รีเฟรช dashboard แล้วครับ' });
        } catch {
          // message หายไป — ส่งใหม่
        }
      }

      const newMsg = await channel.send({ embeds: [embed], components });
      await newMsg.pin().catch(() => {});
      await setDashboardMsgId(interaction.guildId, channel.id, newMsg.id);
      return interaction.editReply({ content: '✅ สร้าง dashboard ใหม่และปักหมุดแล้วครับ' });
    }
  },
};
