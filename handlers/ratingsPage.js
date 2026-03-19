const { MessageFlags } = require('discord.js');
const { buildRatingsEmbed, buildPageRow } = require('../commands/ratings');

/**
 * Handler สำหรับ customId: ratings_page:{targetId}:{page}
 */
module.exports = {
  async handlePageButton(interaction) {
    await interaction.deferUpdate();

    const [, targetId, pageStr] = interaction.customId.split(':');
    const page = Number(pageStr);

    // fetch member จาก guild
    const target = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!target) {
      return interaction.followUp({ content: '❌ ไม่พบสมาชิกคนนี้', flags: MessageFlags.Ephemeral });
    }

    const { embed, totalPages } = await buildRatingsEmbed(target, page);
    const row = buildPageRow(targetId, page, totalPages);

    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};
