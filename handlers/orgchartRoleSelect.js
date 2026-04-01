// handlers/orgchartRoleSelect.js
// handle การเลือก role → แสดง orgchart embed (ephemeral)

const { MessageFlags } = require('discord.js');
const { getConfigByRoleIds } = require('../db/orgchartConfig');
const { getRoleStats, buildOrgChartEmbed } = require('../utils/orgchartEmbed');

const DEFAULT_TOP  = 10;
const DEFAULT_DAYS = 180;

async function handleOrgchartRoleSelect(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== 'orgchart_role') return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const roleId  = interaction.values[0];
  const guildId = interaction.guildId;

  const config = await getConfigByRoleIds(guildId, [roleId]);
  const roleConfig = config.get(roleId);

  if (!roleConfig) {
    return interaction.editReply({
      content: '❌ ไม่พบข้อมูล config ของ role นี้ครับ ลองรัน `/orgchart-scan` ก่อนนะครับ',
    });
  }

  await interaction.guild.members.fetch().catch(() => {});

  const top = await getRoleStats(guildId, interaction.guild, roleConfig, {
    topN: DEFAULT_TOP,
    days: DEFAULT_DAYS,
  });

  if (!top.length) {
    return interaction.editReply({
      content: `ℹ️ ไม่มีข้อมูล activity ของ <@&${roleId}> ในช่วง ${DEFAULT_DAYS} วันที่ผ่านมาครับ`,
    });
  }

  const embed = buildOrgChartEmbed(roleConfig, top, { days: DEFAULT_DAYS });

  return interaction.editReply({ embeds: [embed] });
}

module.exports = { handleOrgchartRoleSelect };
