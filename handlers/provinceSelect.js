// handlers/provinceSelect.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const { ROLES, PROVINCE_ROLES, SUB_REGION_ROLES, MAIN_REGION_ROLES } = require('../config/roles');
const { syncMemberRoles } = require('../db/members');
const { PROVINCE_REGIONS } = require('../config/constants');
const { BKK_HINT } = require('../config/hints');

function buildRegionDropdown(selectedId = null) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('prov_region')
      .setPlaceholder('เลือกภาค')
      .addOptions(PROVINCE_REGIONS.map(r => ({
        label: r.label, value: r.id, default: r.id === selectedId,
      })))
  );
}

function buildProvinceRows(region, memberRoles) {
  const rows = [];
  for (let i = 0; i < region.provinces.length; i += 5) {
    const chunk = region.provinces.slice(i, i + 5);
    rows.push(
      new ActionRowBuilder().addComponents(
        chunk.map(p => {
          const roleId  = PROVINCE_ROLES[p];
          const hasRole = roleId && memberRoles.cache.has(roleId);
          return new ButtonBuilder()
            .setCustomId(`prov_btn:${region.id}:${p}`)
            .setLabel(p)
            .setStyle(hasRole ? ButtonStyle.Primary : ButtonStyle.Secondary);
        })
      )
    );
  }
  return rows;
}

async function handleProvinceRegionSelect(interaction) {
  const regionId = interaction.values[0];
  const region   = PROVINCE_REGIONS.find(r => r.id === regionId);
  const member   = interaction.member;
  await member.fetch();
  await interaction.deferUpdate();

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setTitle(`🗺️ เลือกจังหวัด · ${interaction.guild.name}`)
      .setDescription(regionId === 'bkk' ? BKK_HINT : region.label)
      .setColor(region.color)],
    components: [...buildProvinceRows(region, member.roles), buildRegionDropdown(regionId)],
  });
}

// reverse lookup: role ID → ชื่อ role
const ROLE_ID_TO_NAME = Object.fromEntries(Object.entries(ROLES).map(([name, id]) => [id, name]));

async function handleProvinceBtn(interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('prov_btn:')) return;

  await interaction.deferUpdate();

  const parts    = interaction.customId.split(':');
  const regionId = parts[1];
  const province = parts.slice(2).join(':');
  const member   = interaction.member;

  const provinceRoleId    = PROVINCE_ROLES[province];
  const subRegionRoleId   = SUB_REGION_ROLES[province];
  const mainRegionRoleId  = MAIN_REGION_ROLES[province];

  const hasRole = provinceRoleId && member.roles.cache.has(provinceRoleId);
  const region  = PROVINCE_REGIONS.find((r) => r.id === regionId);

  try {
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
      const rolesToAdd  = [provinceRoleId, subRegionRoleId, mainRegionRoleId].filter(id => id);
      const uniqueRoles = [...new Set(rolesToAdd)];
      if (uniqueRoles.length > 0) await member.roles.add(uniqueRoles);
      uniqueRoles.forEach(id => rolesChanged.push(ROLE_ID_TO_NAME[id] ?? id));
    }

    await member.fetch();
    await syncMemberRoles(member);

    const userId   = interaction.user.id;
    const emoji    = hasRole ? '🔴' : '🟢';
    const action   = hasRole ? 'ถอด' : 'เพิ่ม';
    const roleList = rolesChanged.map(r => `• ${r}`).join('\n');
    const statusMsg = `${emoji} <@${userId}> • ${action} roles แล้ว\n${roleList}`;

    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle(`🗺️ เลือกจังหวัด · ${interaction.guild.name}`)
        .setDescription(regionId === 'bkk' ? `${BKK_HINT}\n\n${statusMsg}` : statusMsg)
        .setColor(region.color)],
      components: [...buildProvinceRows(region, member.roles), buildRegionDropdown(regionId)],
    });

  } catch (err) {
    console.error(`❌ toggle province ${province}:`, err);
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle(`🗺️ เลือกจังหวัด · ${interaction.guild.name}`)
        .setDescription(`❌ เกิดข้อผิดพลาดกับ **${province}**`)
        .setColor(region.color)],
      components: [...buildProvinceRows(region, member.roles), buildRegionDropdown(regionId)],
    });
  }
}

module.exports = { buildRegionDropdown, buildProvinceRows, handleProvinceRegionSelect, handleProvinceBtn };
