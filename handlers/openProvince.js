// handlers/openProvince.js
const { EmbedBuilder, MessageFlags } = require('discord.js');
const { buildRegionDropdown } = require('./provinceSelect');

async function handleOpenProvince(interaction) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'btn_open_province') return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const member = interaction.member;
  await member.fetch();

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setTitle(`🗺️ เลือกจังหวัด · ${interaction.guild.name}`)
      .setDescription('เลือกภาคจาก dropdown · กดจังหวัดเพื่อเพิ่ม/ถอด role')
      .setColor(0x5865F2)],
    components: [buildRegionDropdown()],
  });
}

module.exports = { handleOpenProvince };
