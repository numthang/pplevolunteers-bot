// handlers/orgchartPanelHandler.js
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
} = require('discord.js');
const { getRolesByGroup, getConfigByRoleIds } = require('../db/orgchartConfig');
const { getRoleStats, buildOrgChartEmbed } = require('../utils/orgchartEmbed');
const { PROVINCE_REGIONS } = require('../config/constants');

// ── Constants ─────────────────────────────────────────────────────────────────

const GROUP_OPTIONS = [
  { label: '🌟 ทีมหลัก',       value: 'main'     },
  { label: '🛠️ ทีม Skill',     value: 'skill'    },
  { label: '🗺️ ทีมภาค',       value: 'region'   },
  { label: '📍 ทีมจังหวัด',    value: 'province' },
  { label: '🏘️ ทีมอำเภอ',     value: 'district' },
  { label: '⬜ ยังไม่จัดกลุ่ม', value: 'other'    },
];

const GROUP_EMOJIS = {
  main: '🌟', skill: '🛠️', region: '🗺️',
  province: '📍', district: '🏘️', other: '⬜',
};

const DAYS_OPTIONS = [
  { label: '30 วัน',  value: '30'  },
  { label: '60 วัน',  value: '60'  },
  { label: '90 วัน',  value: '90'  },
  { label: '180 วัน', value: '180' },
  { label: '365 วัน', value: '365' },
];

const NULL = '_';

// ── CustomId helpers ──────────────────────────────────────────────────────────
// format:
//   orgchart_group:{roleId}:{regionId}:{days}:{topN}
//   orgchart_province_region:{roleId}:{days}:{topN}
//   orgchart_role:{group}:{regionId}:{days}:{topN}
//   orgchart_days:{group}:{roleId}:{regionId}:{topN}
//   orgchart_top:{group}:{roleId}:{regionId}:{days}

function enc(...parts) { return parts.map(v => v ?? NULL).join(':'); }
function dec(str)      { return str === NULL ? null : str; }

// ── Build components ──────────────────────────────────────────────────────────

async function buildPanelComponents(guildId, { group, roleId, regionId, days, topN }) {
  const rows = [];

  // Row 1: Group dropdown
  rows.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`orgchart_group:${enc(roleId, regionId, days, topN)}`)
      .addOptions(GROUP_OPTIONS.map(opt => ({ ...opt, default: opt.value === group })))
  ));

  if (group === 'province') {
    // Row 2: Region dropdown
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`orgchart_province_region:${enc(roleId, days, topN)}`)
        .setPlaceholder('เลือกภาค')
        .addOptions(PROVINCE_REGIONS.map(r => ({
          label: r.label, value: r.id, default: r.id === regionId,
        })))
    ));

    // Row 3: Province role dropdown (ถ้าเลือก region แล้ว)
    if (regionId) {
      const region       = PROVINCE_REGIONS.find(r => r.id === regionId);
      const allProvRoles = await getRolesByGroup(guildId, 'province');
      const regionRoles  = allProvRoles
        .filter(r => region?.provinces.includes(r.roleName.replace(/^ทีม/, '').trim()))
        .sort((a, b) => a.roleName.localeCompare(b.roleName, 'th'));

      if (regionRoles.length) {
        rows.push(new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`orgchart_role:${enc(group, regionId, days, topN)}`)
            .setPlaceholder('เลือกจังหวัด')
            .addOptions(regionRoles.slice(0, 25).map(r =>
              new StringSelectMenuOptionBuilder()
                .setLabel(r.roleName).setValue(r.roleId).setEmoji('📍')
                .setDefault(r.roleId === roleId)
            ))
        ));
      }
    }
  } else {
    // Row 2: Role dropdown
    const roles = (await getRolesByGroup(guildId, group))
      .sort((a, b) => a.roleName.localeCompare(b.roleName, 'th'));

    if (roles.length) {
      rows.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`orgchart_role:${enc(group, regionId, days, topN)}`)
          .setPlaceholder('เลือก role ที่ต้องการดู')
          .addOptions(roles.slice(0, 25).map(r =>
            new StringSelectMenuOptionBuilder()
              .setLabel(r.roleName).setValue(r.roleId).setEmoji(GROUP_EMOJIS[group] ?? '📋')
              .setDefault(r.roleId === roleId)
          ))
      ));
    }
  }

  // Row days + row top (แสดงเฉพาะเมื่อมี roleId)
  if (roleId) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`orgchart_days:${enc(group, roleId, regionId, topN)}`)
        .addOptions(DAYS_OPTIONS.map(opt => ({ ...opt, default: opt.value === String(days) })))
    ));

  }

  return rows;
}

// ── Build embed ───────────────────────────────────────────────────────────────

async function buildPanelEmbed(guild, { roleId, days, topN }) {
  if (!roleId) {
    return new EmbedBuilder()
      .setTitle(`🏢 Organization Chart · ${guild.name}`)
      .setDescription(
        'ดูสถิติความ active ของแต่ละทีม\n\n' +
        '**วิธีใช้**\n' +
        '1. เลือกกลุ่มจาก dropdown แรก\n' +
        '2. เลือก role ที่ต้องการดู\n' +
        '3. เปลี่ยนช่วงเวลาและจำนวนได้จาก dropdown ด้านล่าง'
      )
      .setThumbnail(guild.iconURL({ extension: 'png' }))
      .setColor(0x5865F2);
  }

  const config     = await getConfigByRoleIds(guild.id, [roleId]);
  const roleConfig = config.get(roleId);

  if (!roleConfig) {
    return new EmbedBuilder()
      .setTitle('❌ ไม่พบ config')
      .setDescription('ลองรัน `/orgchart scan` ก่อนนะครับ')
      .setColor(0xe74c3c);
  }

  await guild.members.fetch().catch(() => {});
  const top = await getRoleStats(guild.id, guild, roleConfig, { topN, days });

  if (!top.length) {
    return new EmbedBuilder()
      .setTitle(roleConfig.roleName ?? 'ไม่มีข้อมูล')
      .setDescription(`ไม่มี activity ใน ${days} วันที่ผ่านมาครับ`)
      .setColor(0x95a5a6);
  }

  return buildOrgChartEmbed(roleConfig, top, { days });
}

// ── Interaction handlers ──────────────────────────────────────────────────────

async function handleOrgchartGroupSelect(interaction) {
  const parts = interaction.customId.split(':');
  const group  = interaction.values[0];
  const days   = parseInt(dec(parts[3]) ?? '180');
  const topN   = parseInt(dec(parts[4]) ?? '10');

  await interaction.deferUpdate();
  const state = { group, roleId: null, regionId: null, days, topN };
  const [embed, components] = await Promise.all([
    buildPanelEmbed(interaction.guild, state),
    buildPanelComponents(interaction.guildId, state),
  ]);
  await interaction.editReply({ embeds: [embed], components });
}

async function handleOrgchartProvinceSelect(interaction) {
  const parts    = interaction.customId.split(':');
  const regionId = interaction.values[0];
  const days     = parseInt(dec(parts[2]) ?? '180');
  const topN     = parseInt(dec(parts[3]) ?? '10');

  await interaction.deferUpdate();
  const state = { group: 'province', roleId: null, regionId, days, topN };
  const [embed, components] = await Promise.all([
    buildPanelEmbed(interaction.guild, state),
    buildPanelComponents(interaction.guildId, state),
  ]);
  await interaction.editReply({ embeds: [embed], components });
}

async function handleOrgchartRoleSelect(interaction) {
  const parts    = interaction.customId.split(':');
  const roleId   = interaction.values[0];
  const group    = dec(parts[1]) ?? 'main';
  const regionId = dec(parts[2]);
  const days     = parseInt(dec(parts[3]) ?? '180');
  const topN     = parseInt(dec(parts[4]) ?? '10');

  await interaction.deferUpdate();
  const state = { group, roleId, regionId, days, topN };
  const [embed, components] = await Promise.all([
    buildPanelEmbed(interaction.guild, state),
    buildPanelComponents(interaction.guildId, state),
  ]);
  await interaction.editReply({ embeds: [embed], components });
}

async function handleOrgchartDaysSelect(interaction) {
  const parts    = interaction.customId.split(':');
  const days     = parseInt(interaction.values[0]);
  const group    = dec(parts[1]) ?? 'main';
  const roleId   = dec(parts[2]);
  const regionId = dec(parts[3]);
  const topN     = parseInt(dec(parts[4]) ?? '10');

  await interaction.deferUpdate();
  const state = { group, roleId, regionId, days, topN };
  const [embed, components] = await Promise.all([
    buildPanelEmbed(interaction.guild, state),
    buildPanelComponents(interaction.guildId, state),
  ]);
  await interaction.editReply({ embeds: [embed], components });
}

module.exports = {
  buildPanelComponents,
  buildPanelEmbed,
  handleOrgchartGroupSelect,
  handleOrgchartProvinceSelect,
  handleOrgchartRoleSelect,
  handleOrgchartDaysSelect,
};
