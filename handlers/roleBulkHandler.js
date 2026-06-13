// handlers/roleBulkHandler.js
const { EmbedBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');

const DELAY_MS = 300;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function handleRoleAddModal(interaction) {
  const roleId = interaction.customId.split(':')[1];
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  await guild.members.fetch();

  const role = guild.roles.cache.get(roleId);
  if (!role) {
    return interaction.editReply({ content: '❌ ไม่พบ role นี้ในเซิร์ฟเวอร์' });
  }

  const raw = interaction.fields.getTextInputValue('role_usernames');
  const tokens = raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);

  if (tokens.length === 0) {
    return interaction.editReply({ content: '❌ ไม่พบรายชื่อในช่องที่ใส่มา' });
  }

  let success = 0, notFound = 0, failed = 0;
  const notFoundList = [];

  for (const token of tokens) {
    let member;
    if (/^\d{17,20}$/.test(token)) {
      member = guild.members.cache.get(token);
    } else {
      const lower = token.toLowerCase();
      member = guild.members.cache.find(
        m => m.user.username.toLowerCase() === lower ||
             (m.nickname && m.nickname.toLowerCase() === lower)
      );
    }

    if (!member) {
      notFound++;
      notFoundList.push(token);
      continue;
    }

    try {
      await member.roles.add(role);
      success++;
    } catch {
      failed++;
    }
    await sleep(DELAY_MS);
  }

  const lines = [
    `✅ เพิ่ม role **${role.name}** เสร็จแล้ว`,
    `✓ สำเร็จ: **${success}** คน`,
    notFound > 0 ? `⚠️ ไม่พบใน server: **${notFound}** คน — \`${notFoundList.join(', ')}\`` : null,
    failed > 0   ? `❌ Error: **${failed}** คน` : null,
  ].filter(Boolean);

  return interaction.editReply({ content: lines.join('\n') });
}

async function handleRoleMembersCmd(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const role = interaction.options.getRole('role');
  await interaction.guild.members.fetch();

  const members = [...role.members.filter(m => !m.user.bot).values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'th'));

  if (members.length === 0) {
    return interaction.editReply({ content: `📭 ไม่มีสมาชิกใน **${role.name}**` });
  }

  if (members.length <= 50) {
    const lines = members.map((m, i) => `${i + 1}. <@${m.id}> — \`${m.user.username}\``);
    const embed = new EmbedBuilder()
      .setColor(role.color || 0xff6a13)
      .setTitle(`👥 สมาชิกใน ${role.name}`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `ทั้งหมด ${members.length} คน` })
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  const lines = members.map((m, i) => `${i + 1}. ${m.user.username} (${m.id})`);
  const buf = Buffer.from(lines.join('\n'), 'utf8');
  const file = new AttachmentBuilder(buf, { name: `${role.name.replace(/\s+/g, '_')}_members.txt` });

  return interaction.editReply({
    content: `👥 สมาชิกใน **${role.name}** ทั้งหมด **${members.length}** คน`,
    files: [file],
  });
}

module.exports = { handleRoleAddModal, handleRoleMembersCmd };
