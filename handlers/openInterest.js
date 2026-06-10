// handlers/openInterest.js
const { EmbedBuilder, MessageFlags } = require('discord.js');
const { buildGroupedRows } = require('./interestSelect');
const { getPickerRoles } = require('../db/guildRoles');

const HINT = 'กดเพื่อเลือก • กดซ้ำเพื่อถอด\n🔵 = มี role อยู่แล้ว • ⬜ = ยังไม่มี';

async function handleOpenInterest(interaction) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'btn_open_interest') return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const member = interaction.member;
  await member.fetch();
  const displayName = member.displayName ?? interaction.user.username;
  const guildId = interaction.guild.id;

  const interestRows = await getPickerRoles(guildId, 'interest');
  const skillRows    = await getPickerRoles(guildId, 'skill');

  let sent = false;

  // interest = list เดียว (ไม่มี divider sub-section)
  if (interestRows.length) {
    const embed = new EmbedBuilder()
      .setTitle(`🎯 ความสนใจ · ${displayName}`)
      .setDescription(HINT)
      .setColor(0xf1c40f);
    await interaction.editReply({ embeds: [embed], components: buildGroupedRows(interestRows, member.roles, 'interest') });
    sent = true;
  }

  // skill
  if (skillRows.length) {
    const skillEmbed = new EmbedBuilder()
      .setTitle(`🛠️ ความถนัด · ${displayName}`)
      .setDescription(HINT)
      .setColor(0x3498db);
    const payload = { embeds: [skillEmbed], components: buildGroupedRows(skillRows, member.roles, 'skill') };
    if (sent) await interaction.followUp({ flags: MessageFlags.Ephemeral, ...payload });
    else { await interaction.editReply(payload); sent = true; }
  }

  if (!sent) await interaction.editReply({ content: 'ยังไม่มีตัวเลือกในเซิร์ฟเวอร์นี้' });
}

module.exports = { handleOpenInterest };
