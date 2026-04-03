// handlers/interestSelect.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { INTEREST_ROLES, SKILL_ROLES, MEDIA_TEAM_ROLE_ID, MEDIA_TEAM_TRIGGERS } = require('../config/roles');
const { syncMemberRoles } = require('../db/members');
const { INTEREST_BUTTONS, SKILL_BUTTONS } = require('../config/constants');

function buildRows(buttons, roleMap, memberRoles, prefix) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += 4) {
    const chunk = buttons.slice(i, i + 4);
    rows.push(
      new ActionRowBuilder().addComponents(
        chunk.map(b => {
          const roleId  = roleMap[b.key];
          const hasRole = roleId && memberRoles.cache.has(roleId);
          return new ButtonBuilder()
            .setCustomId(`${prefix}:${b.key}`)
            .setLabel(b.label)
            .setEmoji(b.emoji)
            .setStyle(hasRole ? ButtonStyle.Primary : ButtonStyle.Secondary);
        })
      )
    );
  }
  return rows;
}

async function handleInterestSelect(interaction) {
  if (!interaction.isButton()) return;

  const [prefix, ...keyParts] = interaction.customId.split(':');
  if (!['interest', 'skill'].includes(prefix)) return;

  await interaction.deferUpdate();

  const name       = keyParts.join(':');
  const roleMap    = prefix === 'interest' ? INTEREST_ROLES : SKILL_ROLES;
  const buttons    = prefix === 'interest' ? INTEREST_BUTTONS : SKILL_BUTTONS;
  const dn         = interaction.member?.displayName ?? interaction.user?.username ?? '';
  const embedTitle = prefix === 'interest' ? `🎯 ความสนใจ · ${dn}` : `🛠️ ความถนัด · ${dn}`;
  const embedColor = prefix === 'interest' ? 0xf1c40f : 0x3498db;
  const roleId     = roleMap[name];
  const member     = interaction.member;
  const userId     = interaction.user.id;

  function reply(description) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setTitle(embedTitle).setDescription(description).setColor(embedColor)],
      components: buildRows(buttons, roleMap, member.roles, prefix),
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

module.exports = { handleInterestSelect, buildRows };
