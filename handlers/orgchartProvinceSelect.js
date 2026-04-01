// handlers/orgchartProvinceSelect.js
// handle การเลือกภาค → แสดง dropdown จังหวัดในภาคนั้น

const {
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { getRolesByGroup } = require('../db/orgchartConfig');
const { PROVINCE_REGIONS } = require('../config/constants');

async function handleOrgchartProvinceSelect(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== 'orgchart_province_region') return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const regionId = interaction.values[0];
  const region   = PROVINCE_REGIONS.find(r => r.id === regionId);

  if (!region) {
    return interaction.editReply({ content: '❌ ไม่พบข้อมูลภาคนี้ครับ' });
  }

  // ดึง role ทั้งหมดที่เป็น province แล้ว filter ตามจังหวัดในภาคนั้น
  const allProvinceRoles = await getRolesByGroup(interaction.guildId, 'province');

  // province ใน region เช่น ['เชียงใหม่', 'เชียงราย', ...]
  // role name อยู่ในรูป 'ทีมเชียงใหม่' → ตัด 'ทีม' ออกแล้ว match
  const regionRoles = allProvinceRoles.filter(r => {
    const nameWithoutPrefix = r.roleName.replace(/^ทีม/, '').trim();
    return region.provinces.includes(nameWithoutPrefix);
  });

  if (!regionRoles.length) {
    return interaction.editReply({
      content: `❌ ไม่พบข้อมูลทีมจังหวัดในภาค **${region.label}** ครับ`,
    });
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('orgchart_role')
    .setPlaceholder('เลือกจังหวัดที่ต้องการดู')
    .addOptions(
      regionRoles.map(r =>
        new StringSelectMenuOptionBuilder()
          .setLabel(r.roleName)
          .setValue(r.roleId)
      )
    );

  const embed = new EmbedBuilder()
    .setTitle(region.label)
    .setDescription('เลือกจังหวัดที่ต้องการดู')
    .setColor(region.color);

  return interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)],
  });
}

module.exports = { handleOrgchartProvinceSelect };
