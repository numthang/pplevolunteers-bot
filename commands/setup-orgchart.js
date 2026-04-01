// commands/setup-orgchart.js
// วาง persistent orgchart panel ใน channel ตาม group ที่ admin เลือก

const {
  SlashCommandBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  MessageFlags,
} = require('discord.js');
const { getRolesByGroup } = require('../db/orgchartConfig');
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
    .setName('setup-orgchart')
    .setDescription('วาง orgchart panel ใน channel นี้ (admin)')
    .addStringOption(opt =>
      opt.setName('group')
        .setDescription('กลุ่มที่ต้องการแสดง')
        .setRequired(true)
        .addChoices(
          { name: '🌟 ทีมหลัก',    value: 'main'     },
          { name: '🛠️ ทีม Skill',  value: 'skill'    },
          { name: '🗺️ ทีมภาค',    value: 'region'   },
          { name: '📍 ทีมจังหวัด', value: 'province' },
          { name: '🏘️ ทีมอำเภอ',     value: 'district' },
          { name: '⬜ ยังไม่จัดกลุ่ม', value: 'other'    },
        )
    )
    .addBooleanOption(opt =>
      opt.setName('public')
        .setDescription('แสดงผลให้ทุกคนเห็น (default: false)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const isPublic = interaction.options.getBoolean('public') ?? false;
    await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });

    const group   = interaction.options.getString('group');
    const guildId = interaction.guildId;
    const label   = GROUP_LABELS[group];

    // --- Province: แสดง dropdown เลือกภาคก่อน ---
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

    // --- กลุ่มอื่น: แสดง dropdown รายชื่อ role ทันที ---
    const roles = (await getRolesByGroup(guildId, group))
      .sort((a, b) => a.roleName.localeCompare(b.roleName, 'th'));

    if (!roles.length) {
      return interaction.editReply({
        content: `❌ ไม่มี role ใน group **${label}** ครับ ลองรัน \`/orgchart-scan\` ก่อนนะครับ`,
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
  },
};
