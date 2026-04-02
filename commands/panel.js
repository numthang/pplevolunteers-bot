// commands/panel.js
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { getRolesByGroup } = require('../db/orgchartConfig');
const { getSetting, setSetting } = require('../db/settings');
const { PROVINCE_REGIONS } = require('../config/constants');

const GROUP_LABELS = {
  main:     '🌟 ทีมหลัก',
  skill:    '🛠️ ทีม Skill',
  region:   '🗺️ ทีมภาค',
  province: '📍 ทีมจังหวัด',
  district: '🏘️ ทีมอำเภอ',
  other:    '⬜ ยังไม่จัดกลุ่ม',
};

const GROUP_EMOJIS = {
  main:     '🌟',
  skill:    '🛠️',
  region:   '🗺️',
  province: '📍',
  district: '🏘️',
  other:    '⬜',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('วาง panel ต่างๆ ในห้องนี้ (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)

    // --- interest ---
    .addSubcommand(sub =>
      sub.setName('interest')
        .setDescription('วางปุ่มเลือกความสนใจและความถนัด')
        .addStringOption(o => o.setName('title').setDescription('หัวข้อ embed').setRequired(false))
        .addStringOption(o => o.setName('description').setDescription('ข้อความ embed (ใช้ \\n)').setRequired(false))
        .addStringOption(o => o.setName('color').setDescription('สี hex').setRequired(false))
    )

    // --- province ---
    .addSubcommand(sub =>
      sub.setName('province')
        .setDescription('วางปุ่มเลือกจังหวัด')
        .addStringOption(o => o.setName('title').setDescription('หัวข้อ embed').setRequired(false))
        .addStringOption(o => o.setName('description').setDescription('ข้อความ embed (ใช้ \\n)').setRequired(false))
        .addStringOption(o => o.setName('color').setDescription('สี hex').setRequired(false))
    )

    // --- orgchart ---
    .addSubcommand(sub =>
      sub.setName('orgchart')
        .setDescription('วาง orgchart panel')
        .addStringOption(opt =>
          opt.setName('group')
            .setDescription('กลุ่มที่ต้องการแสดง')
            .setRequired(true)
            .addChoices(
              { name: '🌟 ทีมหลัก',       value: 'main'     },
              { name: '🛠️ ทีม Skill',     value: 'skill'    },
              { name: '🗺️ ทีมภาค',       value: 'region'   },
              { name: '📍 ทีมจังหวัด',    value: 'province' },
              { name: '🏘️ ทีมอำเภอ',     value: 'district' },
              { name: '⬜ ยังไม่จัดกลุ่ม', value: 'other'    },
            )
        )
        .addBooleanOption(opt =>
          opt.setName('public')
            .setDescription('แสดงผลให้ทุกคนเห็น (default: false)')
            .setRequired(false)
        )
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
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ================================================================
    if (sub === 'interest') {
      const title       = interaction.options.getString('title') ?? '🎯 เลือกความสนใจและความถนัด';
      const description = (interaction.options.getString('description') ?? 'กดปุ่มด้านล่างเพื่อเลือกความสนใจและความถนัดของคุณ\nสามารถเพิ่มหรือถอดได้ตลอดเวลา').replace(/\\n/g, '\n');
      const color       = interaction.options.getString('color')
        ? parseInt(interaction.options.getString('color').replace('#', ''), 16)
        : 0xf1c40f;

      const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_open_interest')
          .setLabel('🎯 เลือกความสนใจ / ความถนัด')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
      return interaction.followUp({ content: '✅ วาง panel เลือกความสนใจเรียบร้อยครับ', flags: MessageFlags.Ephemeral });
    }

    // ================================================================
    if (sub === 'province') {
      const title       = interaction.options.getString('title') ?? '🗺️ เลือกจังหวัดของคุณ';
      const description = (interaction.options.getString('description') ?? 'กดปุ่มด้านล่างเพื่อเลือกจังหวัดของคุณ\nสามารถเปลี่ยนได้ตลอดเวลา').replace(/\\n/g, '\n');
      const color       = interaction.options.getString('color')
        ? parseInt(interaction.options.getString('color').replace('#', ''), 16)
        : 0x3498db;

      const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_open_province')
          .setLabel('🗺️ เลือกจังหวัด')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
      return interaction.followUp({ content: '✅ วาง panel เลือกจังหวัดเรียบร้อยครับ', flags: MessageFlags.Ephemeral });
    }

    // ================================================================
    if (sub === 'orgchart') {
      const isPublic = interaction.options.getBoolean('public') ?? false;
      await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });

      const group   = interaction.options.getString('group');
      const guildId = interaction.guildId;
      const label   = GROUP_LABELS[group];

      if (group === 'province') {
        const menu = new StringSelectMenuBuilder()
          .setCustomId('orgchart_province_region')
          .setPlaceholder('เลือกภาคที่ต้องการดู')
          .addOptions(
            PROVINCE_REGIONS.map(r =>
              new StringSelectMenuOptionBuilder()
                .setLabel(r.label)
                .setValue(r.id)
            )
          );

        const embed = new EmbedBuilder()
          .setTitle('📍 ทีมจังหวัด')
          .setDescription('เลือกภาคที่ต้องการดู')
          .setColor(0x5865F2);

        await interaction.channel.send({
          embeds: [embed],
          components: [new ActionRowBuilder().addComponents(menu)],
        });

        return interaction.editReply({ content: '✅ วาง panel ทีมจังหวัดแล้วครับ' });
      }

      const roles = (await getRolesByGroup(guildId, group))
        .sort((a, b) => a.roleName.localeCompare(b.roleName, 'th'));

      if (!roles.length) {
        return interaction.editReply({
          content: `❌ ไม่มี role ใน group **${label}** ครับ ลองรัน \`/orgchart scan\` ก่อนนะครับ`,
        });
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId('orgchart_role')
        .setPlaceholder('เลือก role ที่ต้องการดู')
        .addOptions(
          roles.map(r =>
            new StringSelectMenuOptionBuilder()
              .setLabel(r.roleName)
              .setValue(r.roleId)
              .setEmoji(GROUP_EMOJIS[group] ?? '📋')
          )
        );

      const embed = new EmbedBuilder()
        .setTitle(label)
        .setDescription('เลือก role ที่ต้องการดู')
        .setColor(0x5865F2);

      await interaction.channel.send({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(menu)],
      });

      return interaction.editReply({ content: `✅ วาง panel **${label}** แล้วครับ` });
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
