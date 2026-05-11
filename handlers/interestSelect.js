// handlers/interestSelect.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { INTEREST_CONFIG, INTEREST_ROLES, SKILL_ROLES, MEDIA_TEAM_ROLE_ID, MEDIA_TEAM_TRIGGERS } = require('../config/roles');
const { syncMemberRoles } = require('../db/members');
const { SKILL_BUTTONS } = require('../config/constants');

// แบ่ง config เป็น groups ตาม divider
function parseGroups(config) {
  const groups = [];
  let current = null;
  for (const item of config) {
    if (item.divider) {
      current = { title: item.label.replace(/^──\s*|\s*──$/g, '').trim(), items: [] };
      groups.push(current);
    } else if (current) {
      current.items.push(item);
    }
  }
  return groups;
}

// สร้าง rows สำหรับ items กลุ่มเดียว (ไม่มี divider)
function buildGroupedRows(items, roleMap, memberRoles, prefix) {
  const rows = [];
  let chunk = [];
  for (const b of items) {
    const roleId  = roleMap[b.key];
    const hasRole = roleId && memberRoles.cache.has(roleId);
    chunk.push(
      new ButtonBuilder()
        .setCustomId(`${prefix}:${b.key}`)
        .setLabel(b.label)
        .setEmoji(b.emoji)
        .setStyle(hasRole ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
    if (chunk.length === 4) {
      rows.push(new ActionRowBuilder().addComponents(chunk));
      chunk = [];
    }
  }
  if (chunk.length) rows.push(new ActionRowBuilder().addComponents(chunk));
  return rows;
}

// backward compat — flat list ไม่มี group (ใช้ใน registerHandler)
function buildRows(buttons, roleMap, memberRoles, prefix) {
  return buildGroupedRows(buttons.filter(b => !b.divider), roleMap, memberRoles, prefix);
}

async function handleInterestSelect(interaction) {
  if (!interaction.isButton()) return;

  const [prefix, ...keyParts] = interaction.customId.split(':');
  if (!['interest', 'skill'].includes(prefix)) return;

  await interaction.deferUpdate();

  const name       = keyParts.join(':');
  const roleMap    = prefix === 'interest' ? INTEREST_ROLES : SKILL_ROLES;
  const dn         = interaction.member?.displayName ?? interaction.user?.username ?? '';
  const embedColor = prefix === 'interest' ? 0xf1c40f : 0x3498db;
  const roleId     = roleMap[name];
  const member     = interaction.member;
  const userId     = interaction.user.id;

  // หา group ที่ปุ่มนี้อยู่ เพื่อ update เฉพาะ group นั้น
  let embedTitle, groupComponents;
  if (prefix === 'interest') {
    const groups = parseGroups(INTEREST_CONFIG);
    const group  = groups.find(g => g.items.some(item => item.key === name));
    embedTitle       = `🎯 ${group?.title ?? 'ความสนใจ'} · ${dn}`;
    groupComponents  = group ? () => buildGroupedRows(group.items, INTEREST_ROLES, member.roles, 'interest') : () => [];
  } else {
    embedTitle       = `🛠️ ความถนัด · ${dn}`;
    groupComponents  = () => buildRows(SKILL_BUTTONS, SKILL_ROLES, member.roles, 'skill');
  }

  function reply(description) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setTitle(embedTitle).setDescription(description).setColor(embedColor)],
      components: groupComponents(),
    });
  }

  if (!roleId) return reply(`⚠️ ไม่พบ Role ID สำหรับ \`${name}\``);

  try {
    const hasRole = member.roles.cache.has(roleId);

    if (hasRole) {
      await member.roles.remove(roleId);
      if (MEDIA_TEAM_TRIGGERS.includes(name)) {
        await member.fetch();
        const stillHas = MEDIA_TEAM_TRIGGERS.some(
          t => t !== name && member.roles.cache.has(SKILL_ROLES[t])
        );
        if (!stillHas) await member.roles.remove(MEDIA_TEAM_ROLE_ID).catch(() => {});
      }
    } else {
      await member.roles.add(roleId);
      if (MEDIA_TEAM_TRIGGERS.includes(name)) {
        await member.roles.add(MEDIA_TEAM_ROLE_ID).catch(() => {});
      }
    }

    await member.fetch();
    await syncMemberRoles(interaction.member);

    const statusMsg = hasRole
      ? `🔴 <@${userId}> • ถอด role **${name}** ออกแล้ว`
      : `🟢 <@${userId}> • เพิ่ม role **${name}** แล้ว`;
    return reply(statusMsg);

  } catch (err) {
    console.error(`❌ toggle role ${name}:`, err);
    return reply(`❌ <@${userId}> • เกิดข้อผิดพลาดกับ role **${name}**`);
  }
}

module.exports = { handleInterestSelect, buildRows, parseGroups, buildGroupedRows };
