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
