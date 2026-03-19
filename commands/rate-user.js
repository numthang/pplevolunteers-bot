const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rate-user')
    .setDescription('ให้ดาวและความคิดเห็นแก่สมาชิก')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('สมาชิกที่ต้องการให้คะแนน')
        .setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user');

    if (target.id === interaction.user.id) {
      return interaction.reply({
        content: '❌ ไม่สามารถให้คะแนนตัวเองได้',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (target.bot) {
      return interaction.reply({
        content: '❌ ไม่สามารถให้คะแนน Bot ได้',
        flags: MessageFlags.Ephemeral,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xf4c430)
      .setTitle(`⭐ ให้คะแนน ${target.displayName}`)
      .setDescription('เลือกระดับดาวที่ต้องการให้:')
      .setThumbnail(target.displayAvatarURL());

    // ปุ่ม 1–5 ดาว — customId รูปแบบ: rate_stars:{stars}:{targetId}:{targetName}
    const targetName = target.username;
    const row = new ActionRowBuilder().addComponents(
      ...[1, 2, 3, 4, 5].map(n =>
        new ButtonBuilder()
          .setCustomId(`rate_stars:${n}:${target.id}:${encodeURIComponent(targetName)}`)
          .setLabel('⭐'.repeat(n))
          .setStyle(ButtonStyle.Primary)
      )
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  },
};
