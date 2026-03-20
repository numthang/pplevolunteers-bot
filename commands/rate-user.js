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
    const { embed, components } = buildRateReportEmbed(targetUser, displayName);
    const isPublic = interaction.options.getBoolean('public') ?? false;
    
    await interaction.reply({
      embeds: [embed],
      components,
      flags: isPublic ? undefined : MessageFlags.Ephemeral,
    });

    /* await interaction.reply({
      embeds: [embed],
      components,
      flags: MessageFlags.Ephemeral,
    }); */
  },
};