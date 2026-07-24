// handlers/roleBulkHandler.js
const {
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require('discord.js');

const DELAY_MS = 300;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// pending by-role ops รอ user กดยืนยัน — key = interaction.id
const pendingByRole = new Map();
const BYROLE_TTL_MS = 10 * 60 * 1000;

async function handleRoleAddModal(interaction) {
  const roleIds = interaction.customId.split(':')[1].split(',');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  if (guild.members.cache.size < guild.memberCount) {
    await guild.members.fetch().catch(() => null);
  }

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

  if (interaction.guild.members.cache.size < interaction.guild.memberCount) {
    await interaction.guild.members.fetch().catch(() => null);
  }

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
  if (guild.members.cache.size < guild.memberCount) {
    await guild.members.fetch().catch(() => null);
  }

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
  const names = raw.split(/[\n,]+/).map(s => s.trim().replace(/^@/, '')).filter(Boolean);

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

// ── /role by-role ─────────────────────────────────────────────
// เลือกสมาชิกจาก role ที่ชื่อมี keyword แล้ว add/remove/replace
// preview ก่อน แล้วค่อยยิงตอนกดยืนยัน

const ACTION_LABEL = { add: 'เพิ่ม', remove: 'ถอด', replace: 'แทนที่' };

async function handleRoleByRoleCmd(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const keyword = interaction.options.getString('keyword').trim();
  const action = interaction.options.getString('action');
  const pickedRoles = ['role1', 'role2', 'role3', 'role4', 'role5']
    .map(k => interaction.options.getRole(k))
    .filter(Boolean);

  // guard: keyword ห้ามว่าง (required อยู่แล้ว แต่กันช่องว่างล้วน)
  if (!keyword) {
    return interaction.editReply({ content: '❌ ต้องระบุ keyword — ห้ามยิงใส่ทุกคน' });
  }

  // fetch สมาชิกเฉพาะตอน cache ยังไม่ครบ + กัน gateway rate limit (opcode 8) ไม่ให้ crash
  if (guild.members.cache.size < guild.memberCount) {
    await guild.members.fetch().catch(() => null);
  }

  // หา role ที่ชื่อมี keyword — ตัด @everyone + managed role (bot/integration/boost) ทิ้ง
  const kw = keyword.toLowerCase();
  const matched = [...guild.roles.cache.values()].filter(r =>
    r.id !== guild.id && !r.managed && r.name.toLowerCase().includes(kw)
  );

  // guard: match 0 role → หยุด (ห้ามไม่มี condition)
  if (matched.length === 0) {
    return interaction.editReply({ content: `❌ ไม่พบ role ที่ชื่อมี \`${keyword}\` — ยกเลิก` });
  }

  // สมาชิกเป้าหมาย = union ของทุก matched role (ไม่ซ้ำ, ไม่เอา bot)
  const seen = new Set();
  const members = matched
    .flatMap(r => [...r.members.filter(m => !m.user.bot).values()])
    .filter(m => !seen.has(m.id) && seen.add(m.id));

  if (members.length === 0) {
    return interaction.editReply({ content: `📭 ไม่มีสมาชิก (ที่ไม่ใช่บอท) ใน role ที่ match \`${keyword}\`` });
  }

  // แปลง action → grant (เพิ่ม) / take (ถอด)
  let grant = [];
  let take = [];
  let overlap = [];
  if (action === 'add') {
    grant = pickedRoles;
  } else if (action === 'remove') {
    take = pickedRoles;
  } else { // replace: เพิ่ม pickedRoles + ถอด matched role — กัน overlap (ถอด role ที่เพิ่งเพิ่ม)
    grant = pickedRoles;
    const grantIds = new Set(pickedRoles.map(r => r.id));
    take = matched.filter(r => !grantIds.has(r.id));
    overlap = matched.filter(r => grantIds.has(r.id));
  }

  // สิทธิ์: กันแตะ role ที่สูงกว่า/เท่ากับ role สูงสุดของผู้สั่ง (ยกเว้น owner)
  const rolesToTouch = [...grant, ...take];
  const isOwner = guild.ownerId === interaction.user.id;
  const myTop = interaction.member.roles.highest.position;
  const tooHigh = isOwner ? [] : rolesToTouch.filter(r => r.position >= myTop);
  if (tooHigh.length > 0) {
    return interaction.editReply({
      content: `❌ คุณไม่มีสิทธิ์แตะ role ที่สูงกว่าหรือเท่ากับ role สูงสุดของคุณ: ${tooHigh.map(r => `**${r.name}**`).join(', ')}`,
    });
  }

  // สิทธิ์บอท: role ของบอทต้องสูงกว่า role ที่จะแตะ ไม่งั้น API เด้ง
  const botTop = guild.members.me.roles.highest.position;
  const botCannot = rolesToTouch.filter(r => r.position >= botTop);
  if (botCannot.length > 0) {
    return interaction.editReply({
      content: `❌ Role ของบอทต่ำกว่า role เหล่านี้ เลยแตะไม่ได้ (เลื่อน role บอทให้สูงขึ้นก่อน): ${botCannot.map(r => `**${r.name}**`).join(', ')}`,
    });
  }

  // เก็บ op ไว้รอกดยืนยัน (เก็บเป็น id กัน object เก่า)
  const token = interaction.id;
  pendingByRole.set(token, {
    userId: interaction.user.id,
    action,
    grantIds: grant.map(r => r.id),
    takeIds: take.map(r => r.id),
    memberIds: members.map(m => m.id),
  });
  setTimeout(() => pendingByRole.delete(token), BYROLE_TTL_MS);

  // preview embed — โชว์ role ที่ match + จำนวนต่ออัน + รวมไม่ซ้ำ + จะทำอะไร
  const matchLines = matched
    .map(r => `• ${r.name} (${r.members.filter(m => !m.user.bot).size} คน)`)
    .join('\n');
  const grantTxt = grant.length ? grant.map(r => `**${r.name}**`).join(', ') : '—';
  const takeTxt = take.length ? take.map(r => `**${r.name}**`).join(', ') : '—';

  const descLines = [
    `🔍 keyword \`${keyword}\` เจอ **${matched.length}** role:`,
    matchLines,
    '',
    `👥 รวมสมาชิกไม่ซ้ำ: **${members.length}** คน`,
    '',
    `⚙️ Action: **${ACTION_LABEL[action]}**`,
    grant.length ? `➕ เพิ่ม: ${grantTxt}` : null,
    take.length ? `➖ ถอด: ${takeTxt}` : null,
    overlap.length ? `ℹ️ role ที่เพิ่ม match keyword ด้วย — จะไม่ถอดออก: ${overlap.map(r => r.name).join(', ')}` : null,
  ].filter(v => v !== null);

  const embed = new EmbedBuilder()
    .setColor(0xff6a13)
    .setTitle('ยืนยันการจัดการ role ตามเงื่อนไข')
    .setDescription(descLines.join('\n'))
    .setFooter({ text: 'ตรวจ role ที่ match ให้ดีก่อนกดยืนยัน' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`byrole_confirm:${token}`).setLabel(`ยืนยัน (${members.length} คน)`).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`byrole_cancel:${token}`).setLabel('ยกเลิก').setStyle(ButtonStyle.Secondary),
  );

  return interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleRoleByRoleConfirm(interaction) {
  const token = interaction.customId.split(':')[1];
  const op = pendingByRole.get(token);

  if (!op) {
    return interaction.update({ content: '⌛ คำสั่งหมดอายุหรือถูกใช้ไปแล้ว — สั่ง `/role by-role` ใหม่', embeds: [], components: [] });
  }
  if (interaction.user.id !== op.userId) {
    return interaction.reply({ content: '❌ นี่ไม่ใช่คำสั่งของคุณ', flags: MessageFlags.Ephemeral });
  }
  pendingByRole.delete(token);

  const guild = interaction.guild;
  const grant = op.grantIds.map(id => guild.roles.cache.get(id)).filter(Boolean);
  const take = op.takeIds.map(id => guild.roles.cache.get(id)).filter(Boolean);
  const total = op.memberIds.length;
  const reason = `role by-role โดย ${interaction.user.tag}`;

  await interaction.update({ content: `⏳ กำลังทำ 0/${total}...`, embeds: [], components: [] });

  let success = 0, skipped = 0, failed = 0;

  for (let i = 0; i < op.memberIds.length; i++) {
    const member = guild.members.cache.get(op.memberIds[i])
      || await guild.members.fetch(op.memberIds[i]).catch(() => null);

    if (!member) { failed++; continue; }

    const toAdd = grant.filter(r => !member.roles.cache.has(r.id));
    const toRemove = take.filter(r => member.roles.cache.has(r.id));

    if (toAdd.length === 0 && toRemove.length === 0) {
      skipped++;
    } else {
      try {
        if (toAdd.length) await member.roles.add(toAdd, reason);
        if (toRemove.length) await member.roles.remove(toRemove, reason);
        success++;
      } catch {
        failed++;
      }
    }

    if ((i + 1) % 20 === 0 && i + 1 < total) {
      interaction.editReply({ content: `⏳ กำลังทำ ${i + 1}/${total}...` }).catch(() => {});
    }
    await sleep(DELAY_MS);
  }

  const lines = [
    `✅ จัดการ role ตามเงื่อนไขเสร็จแล้ว (${total} คน)`,
    `✓ สำเร็จ: **${success}** คน`,
    skipped > 0 ? `↔️ ข้าม (มี/ไม่มี role อยู่แล้ว): **${skipped}** คน` : null,
    failed > 0 ? `❌ Error: **${failed}** คน` : null,
  ].filter(Boolean);

  return interaction.editReply({ content: lines.join('\n') });
}

async function handleRoleByRoleCancel(interaction) {
  const token = interaction.customId.split(':')[1];
  pendingByRole.delete(token);
  return interaction.update({ content: '❌ ยกเลิกแล้ว', embeds: [], components: [] });
}

module.exports = {
  handleRoleAddModal,
  handleRoleRemoveModal,
  handleRoleMembersCmd,
  handleRoleRecoverModal,
  handleRoleByRoleCmd,
  handleRoleByRoleConfirm,
  handleRoleByRoleCancel,
};
