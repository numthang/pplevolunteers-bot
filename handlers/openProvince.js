// handlers/openProvince.js
const {
  EmbedBuilder,
  MessageFlags
} = require('discord.js');
const { buildRows } = require('../commands/province');
const { PROVINCE_REGIONS } = require('../config/constants');
const { BKK_HINT } = require('../config/hints');

async function handleOpenProvince(interaction) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'btn_open_province') return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const member = interaction.member;
  await member.fetch();
  const memberRoles = member.roles;

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setTitle('🏙️ กรุงเทพฯ & ปริมณฑล')
      .setDescription(BKK_HINT)
      .setColor(0x3498db)],
    components: buildRows(PROVINCE_REGIONS[0], memberRoles),
  });

  for (let i = 1; i < PROVINCE_REGIONS.length; i++) {
    const region = PROVINCE_REGIONS[i];
    await interaction.followUp({
      flags: MessageFlags.Ephemeral,
      embeds: [new EmbedBuilder().setTitle(region.label).setColor(region.color)],
      components: buildRows(region, memberRoles),
    });
  }
}

module.exports = { handleOpenProvince };
