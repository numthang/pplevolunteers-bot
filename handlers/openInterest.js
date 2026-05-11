// handlers/openInterest.js
const {
  EmbedBuilder,
  MessageFlags
} = require('discord.js');
const { INTEREST_CONFIG, INTEREST_ROLES, SKILL_ROLES } = require('../config/roles');
const { SKILL_BUTTONS } = require('../config/constants');
const { buildRows, parseGroups, buildGroupedRows } = require('./interestSelect');

async function handleOpenInterest(interaction) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'btn_open_interest') return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const member = interaction.member;
  await member.fetch();
  const memberRoles = member.roles;
  const displayName = member.displayName ?? interaction.user.username;

  // ส่ง interest แยกต่อ group
  const groups = parseGroups(INTEREST_CONFIG);
  let first = true;
  for (const group of groups) {
    const embed = new EmbedBuilder()
      .setTitle(`🎯 ${group.title} · ${displayName}`)
      .setDescription('กดเพื่อเลือก • กดซ้ำเพื่อถอด\n🔵 = มี role อยู่แล้ว • ⬜ = ยังไม่มี')
      .setColor(0xf1c40f);
    const components = buildGroupedRows(group.items, INTEREST_ROLES, memberRoles, 'interest');
    if (first) {
      await interaction.editReply({ embeds: [embed], components });
      first = false;
    } else {
      await interaction.followUp({ flags: MessageFlags.Ephemeral, embeds: [embed], components });
    }
  }

  // ส่ง skill ต่อท้าย
  const skillEmbed = new EmbedBuilder()
    .setTitle(`🛠️ ความถนัด · ${displayName}`)
    .setDescription('กดเพื่อเลือก • กดซ้ำเพื่อถอด\n🔵 = มี role อยู่แล้ว • ⬜ = ยังไม่มี')
    .setColor(0x3498db);

  await interaction.followUp({
    flags: MessageFlags.Ephemeral,
    embeds: [skillEmbed],
    components: buildRows(SKILL_BUTTONS, SKILL_ROLES, memberRoles, 'skill'),
  });
}

module.exports = { handleOpenInterest };
