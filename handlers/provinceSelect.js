// handlers/provinceSelect.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const { syncMemberRoles } = require('../db/members');
const { PROVINCE_REGIONS } = require('../config/constants');
const { BKK_HINT } = require('../config/hints');
const { getRolesByScopePrefix, addRoleWithParents, removeRoleWithParents } = require('../db/guildRoles');

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

// provinceToRoleId: { 'ราชบุรี': 'role_id', ... } — pre-fetched โดย caller
// opts: { disableAll, overrideProvince, overrideHasRole } — ใช้สำหรับ optimistic UI
function buildProvinceRows(region, memberRoles, provinceToRoleId, opts = {}) {
  const { disableAll = false, overrideProvince = null, overrideHasRole = false } = opts;
  const rows = [];
  for (let i = 0; i < region.provinces.length; i += 5) {
    const chunk = region.provinces.slice(i, i + 5);
    rows.push(
      new ActionRowBuilder().addComponents(
        chunk.map(p => {
          const roleId  = provinceToRoleId[p];
          let hasRole   = roleId && memberRoles.cache.has(roleId);
          if (overrideProvince === p) hasRole = overrideHasRole;
          return new ButtonBuilder()
            .setCustomId(`prov_btn:${region.id}:${p}`)
            .setLabel(p)
            .setStyle(hasRole ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(disableAll);
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

  const pRows = await getRolesByScopePrefix(interaction.guild.id, 'province:');
  const provinceToRoleId = Object.fromEntries(pRows.map(r => [r.scope_node.split(':')[1], r.role_id]));

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setTitle(`🗺️ เลือกจังหวัด · ${interaction.guild.name}`)
      .setDescription(regionId === 'bkk' ? BKK_HINT : region.label)
      .setColor(region.color)],
    components: [...buildProvinceRows(region, member.roles, provinceToRoleId), buildRegionDropdown(regionId)],
  });
}

async function handleProvinceBtn(interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('prov_btn:')) return;

  await interaction.deferUpdate();

  const parts    = interaction.customId.split(':');
  const regionId = parts[1];
  const province = parts.slice(2).join(':');
  const member   = interaction.member;
  const guildId  = interaction.guild.id;

  const pRows = await getRolesByScopePrefix(guildId, 'province:');
  const provinceToRoleId = Object.fromEntries(pRows.map(r => [r.scope_node.split(':')[1], r.role_id]));

  const provinceRoleId = provinceToRoleId[province];
  const hasRole  = provinceRoleId && member.roles.cache.has(provinceRoleId);
  const region   = PROVINCE_REGIONS.find((r) => r.id === regionId);

  // Optimistic: flip สีปุ่มทันที + disable ทั้ง panel ป้องกัน double-click
  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setTitle(`🗺️ เลือกจังหวัด · ${interaction.guild.name}`)
      .setDescription('⏳ กำลังดำเนินการ...')
      .setColor(region.color)],
    components: [
      ...buildProvinceRows(region, member.roles, provinceToRoleId, { disableAll: true, overrideProvince: province, overrideHasRole: !hasRole }),
      buildRegionDropdown(regionId),
    ],
  });

  try {
    let parentIds;
    if (hasRole) {
      parentIds = await removeRoleWithParents(member, provinceRoleId);
    } else {
      parentIds = await addRoleWithParents(member, provinceRoleId);
    }

    await member.fetch();
    await syncMemberRoles(member);

    const parentNames = parentIds
      .map(id => interaction.guild.roles.cache.get(id)?.name)
      .filter(Boolean);

    const userId   = interaction.user.id;
    const emoji    = hasRole ? '🔴' : '🟢';
    const action   = hasRole ? 'ถอด' : 'เพิ่ม';
    const parentSuffix = parentNames.length
      ? ` (${hasRole ? 'พร้อมถอด' : 'พร้อม'} ${parentNames.join(' · ')})`
      : '';
    const statusMsg = `${emoji} <@${userId}> • ${action} role จังหวัด **${province}**${parentSuffix} แล้ว`;

    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle(`🗺️ เลือกจังหวัด · ${interaction.guild.name}`)
        .setDescription(regionId === 'bkk' ? `${BKK_HINT}\n\n${statusMsg}` : statusMsg)
        .setColor(region.color)],
      components: [...buildProvinceRows(region, member.roles, provinceToRoleId), buildRegionDropdown(regionId)],
    });

  } catch (err) {
    console.error(`❌ toggle province ${province}:`, err);
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle(`🗺️ เลือกจังหวัด · ${interaction.guild.name}`)
        .setDescription(`❌ เกิดข้อผิดพลาดกับ **${province}**`)
        .setColor(region.color)],
      components: [...buildProvinceRows(region, member.roles, provinceToRoleId), buildRegionDropdown(regionId)],
    });
  }
}

module.exports = { buildRegionDropdown, buildProvinceRows, handleProvinceRegionSelect, handleProvinceBtn };
