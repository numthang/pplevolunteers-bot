// handlers/interestSelect.js
const { INTEREST_ROLES, SKILL_ROLES, MEDIA_TEAM_ROLE_ID, MEDIA_TEAM_TRIGGERS } = require('../config/roles');
const { buildRows } = require('../commands/interest');
const { syncMemberRoles } = require('../db/members');
const { INTEREST_BUTTONS, SKILL_BUTTONS } = require('../config/constants');

async function handleInterestSelect(interaction) {
  if (!interaction.isButton()) return;

  const [prefix, ...keyParts] = interaction.customId.split(':');
  if (!['interest', 'skill'].includes(prefix)) return;

  await interaction.deferUpdate();

  const name = keyParts.join(':');
  const roleMap = prefix === 'interest' ? INTEREST_ROLES : SKILL_ROLES;
  const buttons = prefix === 'interest' ? INTEREST_BUTTONS : SKILL_BUTTONS;
  const embedTitle = prefix === 'interest' ? '🎯 ความสนใจของคุณคืออะไร?' : '🛠️ ความถนัดของคุณคืออะไร?';
  const embedColor = prefix === 'interest' ? 0xf1c40f : 0x3498db;
  const roleId = roleMap[name];
  const member = interaction.member;

  if (!roleId) {
    return interaction.editReply({
      embeds: [{
        title: embedTitle,
        description: `⚠️ ไม่พบ Role ID สำหรับ \`${name}\``,
        color: embedColor,
      }],
      components: buildRows(buttons, roleMap, member.roles, prefix),
    });
  }

  try {
    const hasRole = member.roles.cache.has(roleId);

    if (hasRole) {
      await member.roles.remove(roleId);

      // ถ้าถอด role ที่เป็น trigger ออก → เช็กว่ายังมี trigger role อื่นอยู่ไหม
      if (MEDIA_TEAM_TRIGGERS.includes(name)) {
        await member.fetch();
        const stillHasMediaTrigger = MEDIA_TEAM_TRIGGERS.some(
          t => t !== name && member.roles.cache.has(SKILL_ROLES[t])
        );
        if (!stillHasMediaTrigger) {
          await member.roles.remove(MEDIA_TEAM_ROLE_ID).catch(() => {});
        }
      }
    } else {
      await member.roles.add(roleId);

      // ถ้าเพิ่ม role ที่เป็น trigger → เพิ่ม ทีมสื่อ ด้วย
      if (MEDIA_TEAM_TRIGGERS.includes(name)) {
        await member.roles.add(MEDIA_TEAM_ROLE_ID).catch(() => {});
      }
    }

    await member.fetch();
    //อัพเดททุก Roles ใหม่หมดหลังแก้ไข
    await syncMemberRoles(interaction.member); 

    const statusMsg = hasRole
      ? `🔴 ถอด role **${name}** ออกแล้ว`
      : `🟢 เพิ่ม role **${name}** แล้ว`;

    await interaction.editReply({
      embeds: [{
        title: embedTitle,
        description: `${statusMsg}`,
        color: embedColor,
      }],
      components: buildRows(buttons, roleMap, member.roles, prefix),
    });

  } catch (err) {
    console.error(`❌ toggle role ${name}:`, err);
    await interaction.editReply({
      embeds: [{
        title: embedTitle,
        description: `❌ เกิดข้อผิดพลาดกับ role **${name}**`,
        color: embedColor,
      }],
      components: buildRows(buttons, roleMap, member.roles, prefix),
    });
  }
}

module.exports = { handleInterestSelect };
