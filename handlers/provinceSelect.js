// handlers/provinceSelect.js
const { PROVINCE_ROLES, SUB_REGION_ROLES, MAIN_REGION_ROLES } = require('../config/roles');
const { buildRows } = require('../commands/province');
const { syncMemberRoles } = require('../db/members');
const { PROVINCE_REGIONS } = require('../config/constants');
const { MessageFlags } = require('discord.js');

async function handleProvinceBtn(interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('prov_btn:')) return;

  // *** deferUpdate ลบออก — ใช้ deferReply ephemeral แทน ***
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const parts = interaction.customId.split(':');
  const regionId = parts[1];
  const province = parts.slice(2).join(':');
  const member = interaction.member;

  const provinceRoleId = PROVINCE_ROLES[province];
  const subRegionRoleId = SUB_REGION_ROLES[province];
  const mainRegionRoleId = MAIN_REGION_ROLES[province];

  const hasRole = provinceRoleId && member.roles.cache.has(provinceRoleId);

  try {
    if (hasRole) {
      await member.roles.remove(provinceRoleId);
      await member.fetch();

      if (subRegionRoleId) {
        const stillHasSub = Object.keys(SUB_REGION_ROLES).some(p =>
          SUB_REGION_ROLES[p] === subRegionRoleId && member.roles.cache.has(PROVINCE_ROLES[p])
        );
        if (!stillHasSub) await member.roles.remove(subRegionRoleId);
      }

      if (mainRegionRoleId) {
        const stillHasMain = Object.keys(MAIN_REGION_ROLES).some(p =>
          MAIN_REGION_ROLES[p] === mainRegionRoleId && member.roles.cache.has(PROVINCE_ROLES[p])
        );
        if (!stillHasMain) await member.roles.remove(mainRegionRoleId);
      }

    } else {
      const rolesToAdd = [provinceRoleId, subRegionRoleId, mainRegionRoleId].filter(id => id);
      if (rolesToAdd.length > 0) await member.roles.add(rolesToAdd);
    }

    // *** fetch member ใหม่เพื่อให้ cache อัปเดต ***
    await member.fetch();
    await syncMemberRoles(member);

    const region = PROVINCE_REGIONS.find((r) => r.id === regionId);
    const statusMsg = hasRole
      ? `🔴 ถอด **${province}** ออกแล้ว`
      : `🟢 เพิ่ม **${province}** แล้ว`;

    // *** ส่ง ephemeral reply กลับเฉพาะคนกด พร้อม state ของตัวเอง ***
    await interaction.editReply({
      embeds: [{
        title: region.label,
        description: statusMsg,
        color: region.color,
      }],
      // *** member.roles ของคนที่กด — ถูกต้องเสมอ ***
      components: buildRows(region, member.roles),
    });

  } catch (err) {
    console.error(`❌ toggle province ${province}:`, err);
    await interaction.editReply({
      embeds: [{
        title: '❌ เกิดข้อผิดพลาด',
        description: `ไม่สามารถแก้ไข role จังหวัด **${province}** ได้`,
        color: 0xe74c3c,
      }],
    });
  }
}

module.exports = { handleProvinceBtn };
