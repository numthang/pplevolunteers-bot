// handlers/openInterest.js
const {
  EmbedBuilder,
  MessageFlags
} = require('discord.js');
const { INTEREST_ROLES, SKILL_ROLES } = require('../config/roles');
const { INTEREST_BUTTONS, SKILL_BUTTONS } = require('../config/constants');
const { buildRows } = require('./interestSelect');

async function handleOpenInterest(interaction) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'btn_open_interest') return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const member = interaction.member;
  await member.fetch();
  const memberRoles = member.roles;

  const displayName = member.displayName ?? interaction.user.username;

  const interestEmbed = new EmbedBuilder()
    .setTitle(`🎯 ความสนใจ · ${displayName}`)
    .setDescription('กดเพื่อเลือก • กดซ้ำเพื่อถอด\n🔵 = มี role อยู่แล้ว • ⬜ = ยังไม่มี')
    .setColor(0xf1c40f);

  const skillEmbed = new EmbedBuilder()
    .setTitle(`🛠️ ความถนัด · ${displayName}`)
    .setDescription('กดเพื่อเลือก • กดซ้ำเพื่อถอด\n🔵 = มี role อยู่แล้ว • ⬜ = ยังไม่มี')
    .setColor(0x3498db);

  await interaction.editReply({
    embeds: [interestEmbed],
    components: buildRows(INTEREST_BUTTONS, INTEREST_ROLES, memberRoles, 'interest'),
  });

  await interaction.followUp({
    flags: MessageFlags.Ephemeral,
    embeds: [skillEmbed],
    components: buildRows(SKILL_BUTTONS, SKILL_ROLES, memberRoles, 'skill'),
  });
}

module.exports = { handleOpenInterest };
