// handlers/roleBulkHandler.js
const { EmbedBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');

const DELAY_MS = 300;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function handleRoleAddModal(interaction) {
  const roleIds = interaction.customId.split(':')[1].split(',');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  await guild.members.fetch();

  const roles = roleIds.map(id => guild.roles.cache.get(id)).filter(Boolean);
  if (roles.length === 0) {
    return interaction.editReply({ content: '❌ ไม่พบ role ในเซิร์ฟเวอร์' });
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
      await member.roles.add(roles);
      success++;
    } catch {
      failed++;
    }
    await sleep(DELAY_MS);
  }

  const roleNames = roles.map(r => `**${r.name}**`).join(', ');
  const lines = [
    `✅ เพิ่ม role ${roleNames} เสร็จแล้ว`,
    `✓ สำเร็จ: **${success}** คน`,
    notFound > 0 ? `⚠️ ไม่พบใน server: **${notFound}** คน — \`${notFoundList.join(', ')}\`` : null,
    failed > 0   ? `❌ Error: **${failed}** คน` : null,
  ].filter(Boolean);

  return interaction.editReply({ content: lines.join('\n') });
}

async function handleRoleMembersCmd(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const roles = ['role1','role2','role3','role4','role5']
    .map(k => interaction.options.getRole(k))
    .filter(Boolean);

  await interaction.guild.members.fetch();

  const seen = new Set();
  const members = roles
    .flatMap(r => [...r.members.filter(m => !m.user.bot).values()])
    .filter(m => !seen.has(m.id) && seen.add(m.id))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'th'));

  const title = roles.length === 1
    ? `👥 สมาชิกใน ${roles[0].name}`
    : `👥 สมาชิกใน ${roles.map(r => r.name).join(', ')}`;

  if (members.length === 0) {
    return interaction.editReply({ content: `📭 ไม่มีสมาชิกใน **${roles.map(r => r.name).join(', ')}**` });
  }

  const usernames = members.map(m => m.user.username);

  if (members.length <= 50) {
    const listLines = members.map((m, i) => `${i + 1}. <@${m.id}> — \`${m.user.username}\``);
    const embed = new EmbedBuilder()
      .setColor(roles[0].color || 0xff6a13)
      .setTitle(title)
      .setDescription(listLines.join('\n'))
      .setFooter({ text: `ทั้งหมด ${members.length} คน` })
      .setTimestamp();
    return interaction.editReply({
      embeds: [embed],
      content: `\`\`\`\n${usernames.join('\n')}\n\`\`\``,
    });
  }

  const buf = Buffer.from(usernames.join('\n'), 'utf8');
  const fname = roles.map(r => r.name.replace(/\s+/g, '_')).join('+') + '_members.txt';
  const file = new AttachmentBuilder(buf, { name: fname });

  return interaction.editReply({
    content: `${title} ทั้งหมด **${members.length}** คน`,
    files: [file],
  });
}

async function handleRoleRemoveModal(interaction) {
  const roleIds = interaction.customId.split(':')[1].split(',');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  await guild.members.fetch();

  const roles = roleIds.map(id => guild.roles.cache.get(id)).filter(Boolean);
  if (roles.length === 0) {
    return interaction.editReply({ content: '❌ ไม่พบ role ในเซิร์ฟเวอร์' });
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
      await member.roles.remove(roles);
      success++;
    } catch {
      failed++;
    }
    await sleep(DELAY_MS);
  }

  const roleNames = roles.map(r => `**${r.name}**`).join(', ');
  const lines = [
    `✅ ถอด role ${roleNames} เสร็จแล้ว`,
    `✓ สำเร็จ: **${success}** คน`,
    notFound > 0 ? `⚠️ ไม่พบใน server: **${notFound}** คน — \`${notFoundList.join(', ')}\`` : null,
    failed > 0   ? `❌ Error: **${failed}** คน` : null,
  ].filter(Boolean);

  return interaction.editReply({ content: lines.join('\n') });
}

async function handleRoleRecoverModal(interaction) {
  const userId = interaction.customId.split(':')[1];
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    return interaction.editReply({ content: '❌ ไม่พบสมาชิกคนนี้ในเซิร์ฟเวอร์' });
  }

  await guild.roles.fetch();

  const raw = interaction.fields.getTextInputValue('role_names');
  const names = raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);

  if (names.length === 0) {
    return interaction.editReply({ content: '❌ ไม่พบชื่อ role ในช่องที่ใส่มา' });
  }

  const found = [];
  const missing = [];
  for (const name of names) {
    const role = guild.roles.cache.find(r => r.name === name);
    if (role) found.push(role); else missing.push(name);
  }

  const alreadyHas = found.filter(r => member.roles.cache.has(r.id));
  const toAdd      = found.filter(r => !member.roles.cache.has(r.id));

  if (toAdd.length === 0) {
    return interaction.editReply({
      content: [
        `ℹ️ ${member.user.username} มี role ที่ระบุครบอยู่แล้ว`,
        missing.length > 0 ? `⚠️ ไม่พบ role ในเซิร์ฟเวอร์: \`${missing.join(', ')}\`` : null,
      ].filter(Boolean).join('\n'),
    });
  }

  try {
    await member.roles.add(toAdd, `role recover โดย ${interaction.user.tag}`);
  } catch (err) {
    return interaction.editReply({ content: `❌ เพิ่ม role ไม่สำเร็จ: ${err.message}` });
  }

  const lines = [
    `✅ คืน role ให้ ${member.user.username} สำเร็จ ${toAdd.length}/${found.length}: ${toAdd.map(r => `**${r.name}**`).join(', ')}`,
    alreadyHas.length > 0 ? `ℹ️ มีอยู่แล้ว ไม่แตะซ้ำ: ${alreadyHas.map(r => r.name).join(', ')}` : null,
    missing.length > 0    ? `⚠️ ไม่พบ role ในเซิร์ฟเวอร์: \`${missing.join(', ')}\`` : null,
  ].filter(Boolean);

  return interaction.editReply({ content: lines.join('\n') });
}

module.exports = { handleRoleAddModal, handleRoleRemoveModal, handleRoleMembersCmd, handleRoleRecoverModal };
