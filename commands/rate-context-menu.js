const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('⭐ ให้คะแนน')
    .setType(ApplicationCommandType.User),

  async execute(interaction) {
    console.log('context menu triggered:', interaction.user.id, interaction.targetUser.id);
    const target = interaction.targetMember ?? interaction.targetUser;
    const targetUser = interaction.targetUser;

    if (targetUser.id === interaction.user.id) {
      return interaction.reply({
        content: '❌ ไม่สามารถให้คะแนนตัวเองได้',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (targetUser.bot) {
      return interaction.reply({
        content: '❌ ไม่สามารถให้คะแนน Bot ได้',
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetName = target?.displayName ?? targetUser.username;
    const encodedName = encodeURIComponent(targetName);

    const embed = new EmbedBuilder()
      .setColor(0xf4c430)
      .setTitle(`⭐ ให้คะแนน ${targetName}`)
      .setDescription('เลือกระดับดาวที่ต้องการให้:')
      .setThumbnail(targetUser.displayAvatarURL());

    const row = new ActionRowBuilder().addComponents(
      ...[1, 2, 3, 4, 5].map(n =>
        new ButtonBuilder()
          .setCustomId(`rate_stars:${n}:${targetUser.id}:${encodedName}`)
          .setLabel('⭐'.repeat(n))
          .setStyle(ButtonStyle.Primary)
      )
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },
};
