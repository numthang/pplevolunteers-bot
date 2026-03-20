// commands/rate-context-menu.js

const { ContextMenuCommandBuilder, ApplicationCommandType, MessageFlags } = require('discord.js');
const { buildRateReportEmbed } = require('../components/rateReportEmbed');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('⭐ ให้คะแนน / ร้องเรียน')
    .setType(ApplicationCommandType.User),

  async execute(interaction) {
    const targetUser   = interaction.targetUser;
    const targetMember = interaction.targetMember;

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

    const displayName = targetMember?.displayName ?? targetUser.username;
    const { embed, components } = buildRateReportEmbed(targetUser, displayName);

    await interaction.reply({
      embeds: [embed],
      components,
      flags: MessageFlags.Ephemeral,
    });
  },
};