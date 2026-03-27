// handlers/provinceSelect.js
const { ROLES, PROVINCE_ROLES, SUB_REGION_ROLES, MAIN_REGION_ROLES } = require('../config/roles');
const { buildRows } = require('../commands/province');
const { syncMemberRoles } = require('../db/members');
const { PROVINCE_REGIONS } = require('../config/constants');

// reverse lookup: role ID → ชื่อ role
const ROLE_ID_TO_NAME = Object.fromEntries(Object.entries(ROLES).map(([name, id]) => [id, name]));

async function handleProvinceBtn(interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('prov_btn:')) return;

  await interaction.deferUpdate();

  const parts = interaction.customId.split(':');
  const regionId = parts[1];
  const province = parts.slice(2).join(':');
  const member = interaction.member;

  const provinceRoleId = PROVINCE_ROLES[province];
  const subRegionRoleId = SUB_REGION_ROLES[province];
  const mainRegionRoleId = MAIN_REGION_ROLES[province];

  const hasRole = provinceRoleId && member.roles.cache.has(provinceRoleId);
  const region = PROVINCE_REGIONS.find((r) => r.id === regionId);

  try {
    // เก็บว่า role ไหนถูก add/remove จริงๆ
    const rolesChanged = [];

    if (hasRole) {
      await member.roles.remove(provinceRoleId);
      rolesChanged.push(ROLE_ID_TO_NAME[provinceRoleId] ?? province);
      await member.fetch();

      if (subRegionRoleId) {
        const stillHasSub = Object.keys(SUB_REGION_ROLES).some(p =>
          SUB_REGION_ROLES[p] === subRegionRoleId && member.roles.cache.has(PROVINCE_ROLES[p])
        );
        if (!stillHasSub) {
          await member.roles.remove(subRegionRoleId);
          rolesChanged.push(ROLE_ID_TO_NAME[subRegionRoleId]);
        }
      }

      if (mainRegionRoleId && mainRegionRoleId !== subRegionRoleId) {
        const stillHasMain = Object.keys(MAIN_REGION_ROLES).some(p =>
          MAIN_REGION_ROLES[p] === mainRegionRoleId && member.roles.cache.has(PROVINCE_ROLES[p])
        );
        if (!stillHasMain) {
          await member.roles.remove(mainRegionRoleId);
          rolesChanged.push(ROLE_ID_TO_NAME[mainRegionRoleId]);
        }
      }

    } else {
      const rolesToAdd = [provinceRoleId, subRegionRoleId, mainRegionRoleId].filter(id => id);
      // กรองซ้ำ (กรณี sub === main เช่น กทม/ปริมณฑล)
      const uniqueRoles = [...new Set(rolesToAdd)];
      if (uniqueRoles.length > 0) await member.roles.add(uniqueRoles);
      uniqueRoles.forEach(id => rolesChanged.push(ROLE_ID_TO_NAME[id] ?? id));
    }

    await member.fetch();
    await syncMemberRoles(member);

    const emoji = hasRole ? '🔴' : '🟢';
    const action = hasRole ? 'ถอด' : 'เพิ่ม';
    const roleList = rolesChanged.map(r => `• ${r}`).join('\n');
    const statusMsg = `${emoji} ${action} roles แล้ว\n${roleList}`;

    await interaction.editReply({
      embeds: [{
        title: region.label,
        description: statusMsg,
        color: region.color,
      }],
      components: buildRows(region, member.roles),
    });

  } catch (err) {
    console.error(`❌ toggle province ${province}:`, err);
    await interaction.editReply({
      embeds: [{
        title: region.label,
        description: `❌ เกิดข้อผิดพลาดกับ **${province}**`,
        color: region.color,
      }],
      components: buildRows(region, member.roles),
    });
  }
}

module.exports = { handleProvinceBtn };