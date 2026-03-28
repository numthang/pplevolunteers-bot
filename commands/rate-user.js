// commands/rate-user.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { buildRateReportEmbed } = require('../components/rateReportEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rate-user')
    .setDescription('ให้คะแนนหรือร้องเรียนสมาชิก')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('สมาชิกที่ต้องการให้คะแนนหรือร้องเรียน')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('title')
        .setDescription('หัวข้อ embed (default: ⭐ ให้คะแนน / ร้องเรียน)')
        .setRequired(false)
        .setMaxLength(256)
    )
    .addStringOption(opt =>
      opt.setName('description')
        .setDescription('คำอธิบายเพิ่มเติมใน embed (default: แสดง mention ของสมาชิก)')
        .setRequired(false)
        .setMaxLength(4096)
    )
    .addBooleanOption(opt =>
      opt.setName('public')
        .setDescription('แสดงให้ทุกคนในช่องเห็น (default: เฉพาะคุณ)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const targetUser = interaction.options.getUser('user');

    if (targetUser.id === interaction.user.id) {
      return interaction.reply({
        content: '❌ ไม่สามารถให้คะแนนหรือร้องเรียนตัวเองได้',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (targetUser.bot) {
      return interaction.reply({
        content: '❌ ไม่สามารถให้คะแนนหรือร้องเรียน Bot ได้',
        flags: MessageFlags.Ephemeral,
      });
    }

    const displayName = target?.displayName ?? targetUser.username;
    const customTitle = interaction.options.getString('title') ?? null;
    const customDescription = interaction.options.getString('description') ?? null;
    const isPublic = interaction.options.getBoolean('public') ?? false;

    const { embed, components } = buildRateReportEmbed(targetUser, displayName, {
      title: customTitle,
      description: customDescription,
    });

    await interaction.reply({
      embeds: [embed],
      components,
      flags: isPublic ? undefined : MessageFlags.Ephemeral,
    });
  },
};
