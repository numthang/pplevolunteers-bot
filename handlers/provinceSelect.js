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
  const subRegionRoleId = SUB_REGION_ROLES[province];
  const mainRegionRoleId = MAIN_REGION_ROLES[province];

  const hasRole = provinceRoleId && member.roles.cache.has(provinceRoleId);

  try {
    /* if (hasRole) {
      if (PROVINCE_ROLES[province]) await member.roles.remove(PROVINCE_ROLES[province]);
      if (SUB_REGION_ROLES[province]) await member.roles.remove(SUB_REGION_ROLES[province]);
      if (MAIN_REGION_ROLES[province]) await member.roles.remove(MAIN_REGION_ROLES[province]);
    } else {
      if (PROVINCE_ROLES[province]) await member.roles.add(PROVINCE_ROLES[province]);
      if (SUB_REGION_ROLES[province]) await member.roles.add(SUB_REGION_ROLES[province]);
      if (MAIN_REGION_ROLES[province]) await member.roles.add(MAIN_REGION_ROLES[province]);
    } */
    if (hasRole) {
      // 1. ถอดยศจังหวัดออกก่อนทันที
      await member.roles.remove(provinceRoleId);
      
      // ต้อง fetch ใหม่เพื่อให้ cache ของ member.roles อัปเดตล่าสุดก่อนเช็กตัวถัดไป
      await member.fetch();

      // 2. เช็กว่ายังเหลือจังหวัดอื่นใน SUB REGION เดียวกันไหม
      if (subRegionRoleId) {
        const stillHasSub = Object.keys(SUB_REGION_ROLES).some(p => 
          SUB_REGION_ROLES[p] === subRegionRoleId && member.roles.cache.has(PROVINCE_ROLES[p])
        );
        if (!stillHasSub) await member.roles.remove(subRegionRoleId);
      }

      // 3. เช็กว่ายังเหลือจังหวัดอื่นใน MAIN REGION เดียวกันไหม
      if (mainRegionRoleId) {
        const stillHasMain = Object.keys(MAIN_REGION_ROLES).some(p => 
          MAIN_REGION_ROLES[p] === mainRegionRoleId && member.roles.cache.has(PROVINCE_ROLES[p])
        );
        if (!stillHasMain) await member.roles.remove(mainRegionRoleId);
      }

    } else {
      // ขา ADD: ใส่ให้ครบทุก Layer ตามปกติ (Discord จัดการเรื่องไม่แอดซ้ำให้เอง)
      const rolesToAdd = [provinceRoleId, subRegionRoleId, mainRegionRoleId].filter(id => id);
      if (rolesToAdd.length > 0) await member.roles.add(rolesToAdd);
    }

    await member.fetch();
    //อัพเดททุก Roles ใหม่หมดหลังแก้ไข
    await syncMemberRoles(member); 

    const region = PROVINCE_REGIONS.find((r) => r.id === regionId);
    await interaction.editReply({
      components: buildRows(region, member.roles),
    });
  } catch (err) {
    console.error(`❌ toggle province ${province}:`, err);
  }
}

module.exports = { handleProvinceBtn };
