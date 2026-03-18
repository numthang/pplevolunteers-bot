// handlers/provinceSelect.js
const { PROVINCE_ROLES, SUB_REGION_ROLES, MAIN_REGION_ROLES } = require('../config/roles');
const { buildRows } = require('../commands/province');
const { syncMemberRoles } = require('../db/members');
const { PROVINCE_REGIONS } = require('../config/constants');

async function handleProvinceBtn(interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('prov_btn:')) return;

  await interaction.deferUpdate();

  const parts = interaction.customId.split(':');
  const regionId = parts[1];
  const province = parts.slice(2).join(':');
  const member = interaction.member;

  const provinceRoleId = PROVINCE_ROLES[province];
  const hasRole = provinceRoleId && member.roles.cache.has(provinceRoleId);

  try {
    if (hasRole) {
      if (PROVINCE_ROLES[province]) await member.roles.remove(PROVINCE_ROLES[province]);
      if (SUB_REGION_ROLES[province]) await member.roles.remove(SUB_REGION_ROLES[province]);
      if (MAIN_REGION_ROLES[province]) await member.roles.remove(MAIN_REGION_ROLES[province]);
    } else {
      if (PROVINCE_ROLES[province]) await member.roles.add(PROVINCE_ROLES[province]);
      if (SUB_REGION_ROLES[province]) await member.roles.add(SUB_REGION_ROLES[province]);
      if (MAIN_REGION_ROLES[province]) await member.roles.add(MAIN_REGION_ROLES[province]);
    }

    await member.fetch();
    //อัพเดททุก Roles ใหม่หมดหลังแก้ไข
    await syncMemberRoles(interaction.member); 

    const region = PROVINCE_REGIONS.find((r) => r.id === regionId);
    await interaction.editReply({
      components: buildRows(region, member.roles),
    });
  } catch (err) {
    console.error(`❌ toggle province ${province}:`, err);
  }
}

module.exports = { handleProvinceBtn };
