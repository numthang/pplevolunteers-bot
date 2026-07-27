// handlers/userInviteHandler.js
// /user invite — mod วางรายชื่อคร่าวๆ (พิมพ์ผิดได้) คั่นด้วย , หรือขึ้นบรรทัดใหม่
// bot fuzzy-match สมาชิกจาก username / display name / nickname → preview → ยืนยัน → โพสต์ mention ในห้องนี้
// ในเธรด/forum post การ mention จะดึงคนเข้าอัตโนมัติ; ในห้องปกติเป็นการปิงเรียก
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');

const TTL_MS      = 5 * 60 * 1000; // preview อายุ 5 นาที
const MAX_TOKENS  = 40;
const MAX_SELECTS = 4;             // เพดาน action row (เหลือ 1 row ให้ปุ่ม)
const SKIP        = '__skip__';
const sleep       = ms => new Promise(r => setTimeout(r, ms));

// invite-id -> { userId, channelId, tokens:[{raw,status,chosen,candidates}], createdAt }
const pending = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of pending) if (now - s.createdAt > TTL_MS) pending.delete(id);
}, 60 * 1000).unref?.();

// แตก + ล้างขยะจากรายชื่อที่ paste มา (Excel/แชท): บรรทัด -, =, เบอร์โทร, @ นำหน้า ฯลฯ
function cleanTokens(raw) {
  // slash-command option รับ newline ไม่ได้ — paste จาก Excel จะกลายเป็นบรรทัดเดียวคั่นด้วยช่องว่างหลายตัว
  // จึงแยกด้วย: comma / tab / ขึ้นบรรทัด / ช่องว่าง 2 ตัวขึ้นไป (ชื่อที่เว้นวรรคเดียวข้างใน เช่น "Pao Worrachit" ยังอยู่รวมกัน)
  return raw
    .split(/[,\n\t]+|\s{2,}/)
    .map(s => s.trim().replace(/^[@\-\s]+/, '').trim()) // ตัด @ / - / ช่องว่างนำหน้า
    .filter(s => s.length > 0)
    .filter(s => !/^[-=_.•·*\s]+$/.test(s))             // เส้น/placeholder ล้วน
    .slice(0, MAX_TOKENS);
}

// ---- fuzzy matching ----
function normalize(s) {
  return (s || '')
    .replace(/\p{Extended_Pictographic}/gu, ' ') // ตัด emoji
    .replace(/[️‍]/g, '')              // variation selector / ZWJ
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^@+\s*/, '');            // ตัด @ นำหน้า (บางคนใส่ @ ในชื่อ เช่น "@Phreaw Angthong")
}

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

// candidate strings ของ member (รวมส่วนที่ split จาก separator เช่น "สมชาย | ราชบุรี")
function memberStrings(m) {
  const raws = [m.user.username, m.user.globalName, m.nickname, m.displayName];
  const out = new Set();
  for (const r of raws) {
    const nr = normalize(r);
    if (!nr) continue;
    out.add(nr);
    for (const part of nr.split(/[|•·/\\\-–—()[\]{}]+/)) {
      const p = part.trim();
      if (p.length >= 2) out.add(p);
    }
  }
  return [...out];
}

function scoreMember(tokenNorm, m) {
  let best = 0;
  const tl = tokenNorm.length;
  for (const s of memberStrings(m)) {
    if (!s) continue;
    const sl = s.length;
    // ratio = ส่วนที่ตรงกันเทียบกับตัวที่ยาวกว่า — กันชื่อสั้นๆ ("p") ไปแมตช์ชื่อยาว ("phreaw...") ด้วยคะแนนสูง
    const ratio = Math.min(sl, tl) / Math.max(sl, tl);
    let score = 0;
    if (s === tokenNorm) score = 1000;
    else if (s.startsWith(tokenNorm) || tokenNorm.startsWith(s))
      score = Math.round(350 + 600 * ratio);   // prefix: ยาวใกล้กันยิ่งสูง
    else if (s.includes(tokenNorm) || tokenNorm.includes(s))
      score = Math.round(250 + 500 * ratio);   // substring กลางคำ: อ่อนกว่า prefix
    else {
      const dist = lev(s, tokenNorm);
      const maxLen = Math.max(sl, tl);
      if (maxLen && dist <= Math.max(2, Math.floor(maxLen * 0.34)))
        score = Math.round(600 * (1 - dist / maxLen));
    }
    if (score > best) best = score;
  }
  return best;
}

function resolveToken(raw, members) {
  // Discord user ID (snowflake 17–20 หลัก) → หาคนตรงๆ ไม่ต้อง fuzzy
  const asId = raw.trim();
  if (/^\d{17,20}$/.test(asId)) {
    const m = members.find(mm => mm.id === asId);
    return m
      ? { status: 'confident', candidates: [{ id: m.id, label: `${m.displayName} (@${m.user.username})`, score: 1000 }], chosen: m.id }
      : { status: 'notfound', candidates: [], chosen: null };
  }

  const tokenNorm = normalize(raw);
  if (tokenNorm.length < 2) return { status: 'notfound', candidates: [], chosen: null };

  const scored = members
    .map(m => ({ id: m.id, label: `${m.displayName} (@${m.user.username})`, score: scoreMember(tokenNorm, m) }))
    .filter(c => c.score >= 400)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  if (!scored.length) return { status: 'notfound', candidates: [], chosen: null };

  const top = scored[0];
  const confident = top.score >= 700 && (scored.length === 1 || top.score - scored[1].score >= 120);
  return {
    status: confident ? 'confident' : 'ambiguous',
    candidates: scored,
    chosen: top.id, // default = ตัวคะแนนสูงสุด
  };
}

// ---- render preview ----
function buildView(id, state) {
  const memName = mid => {
    const t = state.tokens.find(t => t.chosen === mid);
    const c = t?.candidates.find(c => c.id === mid);
    return c ? c.label.replace(/ \(@.+\)$/, '') : mid;
  };

  const ambiguous = state.tokens.filter(t => t.status === 'ambiguous');
  const shown = new Set(ambiguous.slice(0, MAX_SELECTS));

  const lines = state.tokens.map(t => {
    if (t.status === 'notfound') return `❌ \`${t.raw}\` → ไม่พบสมาชิก`;
    if (t.status === 'confident') return `✅ \`${t.raw}\` → <@${t.chosen}>`;
    if (shown.has(t)) return `❓ \`${t.raw}\` → เลือกด้านล่าง (เดา: ${memName(t.chosen)})`;
    return `⚠️ \`${t.raw}\` → <@${t.chosen}> *(เดา — ชื่อกำกวม)*`;
  });

  const nChosen = new Set(state.tokens.filter(t => t.chosen && t.status !== 'notfound').map(t => t.chosen)).size;

  const embed = new EmbedBuilder()
    .setColor(0xff6a13)
    .setTitle('👥 mention สมาชิก — ตรวจสอบก่อนยืนยัน')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `จะ mention ${nChosen} คนในห้องนี้ • ถ้าเป็นเธรด คนจะถูกดึงเข้าอัตโนมัติ` });

  const rows = [];
  for (const t of ambiguous.slice(0, MAX_SELECTS)) {
    const idx = state.tokens.indexOf(t);
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`invite_pick:${id}:${idx}`)
      .setPlaceholder(`เลือกคนสำหรับ "${t.raw}"`.slice(0, 100))
      .addOptions(
        ...t.candidates.slice(0, 24).map(c => ({
          label: c.label.slice(0, 100),
          value: c.id,
          default: c.id === t.chosen,
        })),
        { label: '— ข้ามชื่อนี้ —', value: SKIP, default: t.chosen === null },
      );
    rows.push(new ActionRowBuilder().addComponents(menu));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`invite_confirm:${id}`).setLabel('✅ ยืนยัน mention').setStyle(ButtonStyle.Success).setDisabled(nChosen === 0),
    new ButtonBuilder().setCustomId(`invite_cancel:${id}`).setLabel('ยกเลิก').setStyle(ButtonStyle.Secondary),
  ));

  return { embeds: [embed], components: rows };
}

// ---- entry: /user invite ----
async function startInvite(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const tokens = cleanTokens(interaction.options.getString('names'));
  if (!tokens.length) return interaction.editReply({ content: '❌ ไม่พบชื่อที่ใช้ได้ (กรองบรรทัดว่าง/เครื่องหมาย/เบอร์โทรออกแล้ว)' });

  await interaction.guild.members.fetch().catch(() => {});
  const members = [...interaction.guild.members.cache.values()].filter(m => !m.user.bot);

  const id = `${interaction.id}`;
  const state = {
    userId: interaction.user.id,
    channelId: interaction.channelId,
    createdAt: Date.now(),
    tokens: tokens.map(raw => ({ raw, ...resolveToken(raw, members) })),
  };

  if (state.tokens.every(t => t.status === 'notfound')) {
    return interaction.editReply({ content: '❌ ไม่พบสมาชิกที่ตรงกับชื่อที่ใส่มาเลยครับ ลองพิมพ์ชื่อให้ใกล้เคียงกว่านี้' });
  }

  pending.set(id, state);
  return interaction.editReply(buildView(id, state));
}

function guard(interaction, id) {
  const state = pending.get(id);
  if (!state) {
    interaction.reply({ content: '⏱️ รายการนี้หมดอายุแล้ว รันคำสั่งใหม่อีกครั้งครับ', flags: MessageFlags.Ephemeral }).catch(() => {});
    return null;
  }
  if (interaction.user.id !== state.userId) {
    interaction.reply({ content: '❌ ปุ่มนี้ของคนอื่นครับ', flags: MessageFlags.Ephemeral }).catch(() => {});
    return null;
  }
  return state;
}

async function handleInviteSelect(interaction) {
  const [, id, idxStr] = interaction.customId.split(':');
  const state = guard(interaction, id);
  if (!state) return;
  const t = state.tokens[Number(idxStr)];
  if (t) t.chosen = interaction.values[0] === SKIP ? null : interaction.values[0];
  return interaction.update(buildView(id, state));
}

async function handleInviteConfirm(interaction) {
  const [, id] = interaction.customId.split(':');
  const state = guard(interaction, id);
  if (!state) return;

  const ids = [...new Set(state.tokens.filter(t => t.chosen && t.status !== 'notfound').map(t => t.chosen))];
  if (!ids.length) return interaction.update({ content: '❌ ไม่มีคนให้เชิญครับ', embeds: [], components: [] });

  pending.delete(id);
  await interaction.channel.send({
    content: `📢 ${ids.map(u => `<@${u}>`).join(' ')}`,
    allowedMentions: { users: ids },
  });

  return interaction.update({ content: `✅ mention **${ids.length}** คนแล้วครับ`, embeds: [], components: [] });
}

async function handleInviteCancel(interaction) {
  const [, id] = interaction.customId.split(':');
  const state = guard(interaction, id);
  if (!state) return;
  pending.delete(id);
  return interaction.update({ content: '🚫 ยกเลิกแล้วครับ', embeds: [], components: [] });
}

// ── /user kick-thread ─────────────────────────────────────────
// เลือก role ตรงๆ (ไม่ต้องพิมพ์ keyword) → เอาสมาชิกที่ถือ role นั้นออกจากเธรดปัจจุบัน
// (เอาออกจากเธรดเท่านั้น ไม่แตะ role ใน server)

const pendingKick = new Map(); // token -> { userId, channelId, memberIds }
const KICK_TTL_MS = 10 * 60 * 1000;

async function handleKickThreadCmd(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = interaction.channel;
  if (!channel?.isThread()) {
    return interaction.editReply({ content: '❌ คำสั่งนี้ใช้ได้เฉพาะในเธรดเท่านั้น' });
  }

  const guild = interaction.guild;
  const roles = ['role1', 'role2', 'role3', 'role4', 'role5']
    .map(k => interaction.options.getRole(k))
    .filter(Boolean);

  const botPerms = channel.permissionsFor(guild.members.me);
  if (!botPerms?.has(PermissionFlagsBits.ManageThreads)) {
    return interaction.editReply({ content: '❌ บอทไม่มีสิทธิ์ Manage Threads ในห้องนี้ เอาสมาชิกออกจากเธรดไม่ได้' });
  }

  let threadMembers;
  try {
    threadMembers = await channel.members.fetch();
  } catch {
    return interaction.editReply({ content: '❌ ดึงรายชื่อสมาชิกในเธรดไม่สำเร็จ' });
  }

  if (guild.members.cache.size < guild.memberCount) {
    await guild.members.fetch().catch(() => null);
  }

  const roleIds = new Set(roles.map(r => r.id));
  const matched = [...threadMembers.values()].filter(tm => {
    if (tm.id === interaction.client.user.id) return false;
    const gm = guild.members.cache.get(tm.id);
    if (!gm || gm.user.bot) return false;
    return gm.roles.cache.some(r => roleIds.has(r.id));
  });

  if (matched.length === 0) {
    return interaction.editReply({ content: `📭 ไม่มีใครในเธรดนี้ที่ถือ role: ${roles.map(r => `**${r.name}**`).join(', ')}` });
  }

  const token = interaction.id;
  pendingKick.set(token, {
    userId: interaction.user.id,
    channelId: channel.id,
    memberIds: matched.map(tm => tm.id),
  });
  setTimeout(() => pendingKick.delete(token), KICK_TTL_MS);

  const nameLines = matched
    .map(tm => `<@${tm.id}>`)
    .join(' ');

  const embed = new EmbedBuilder()
    .setColor(0xdf492e)
    .setTitle('ยืนยันการเอาออกจากเธรด')
    .setDescription([
      `Role: ${roles.map(r => `**${r.name}**`).join(', ')}`,
      '',
      `👥 พบ **${matched.length}** คนในเธรดนี้ที่ถือ role ดังกล่าว:`,
      nameLines.length > 1900 ? nameLines.slice(0, 1900) + ' ...' : nameLines,
    ].join('\n'))
    .setFooter({ text: 'เอาออกจากเธรดเท่านั้น ไม่ถอด role ใน server' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`kickthread_confirm:${token}`).setLabel(`ยืนยัน (เอาออก ${matched.length} คน)`).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`kickthread_cancel:${token}`).setLabel('ยกเลิก').setStyle(ButtonStyle.Secondary),
  );

  return interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleKickThreadConfirm(interaction) {
  const token = interaction.customId.split(':')[1];
  const op = pendingKick.get(token);

  if (!op) {
    return interaction.update({ content: '⌛ คำสั่งหมดอายุหรือถูกใช้ไปแล้ว — สั่ง `/user kick-thread` ใหม่', embeds: [], components: [] });
  }
  if (interaction.user.id !== op.userId) {
    return interaction.reply({ content: '❌ นี่ไม่ใช่คำสั่งของคุณ', flags: MessageFlags.Ephemeral });
  }
  pendingKick.delete(token);

  const channel = await interaction.guild.channels.fetch(op.channelId).catch(() => null);
  if (!channel) {
    return interaction.update({ content: '❌ ไม่พบเธรดนี้แล้ว (อาจถูกลบ)', embeds: [], components: [] });
  }

  const total = op.memberIds.length;
  await interaction.update({ content: `⏳ กำลังเอาออก 0/${total}...`, embeds: [], components: [] });

  let success = 0, failed = 0;
  for (let i = 0; i < op.memberIds.length; i++) {
    try {
      await channel.members.remove(op.memberIds[i], `kick-thread โดย ${interaction.user.tag}`);
      success++;
    } catch {
      failed++;
    }
    if ((i + 1) % 10 === 0 && i + 1 < total) {
      interaction.editReply({ content: `⏳ กำลังเอาออก ${i + 1}/${total}...` }).catch(() => {});
    }
    await sleep(300);
  }

  const lines = [
    `✅ เอาออกจากเธรดเสร็จแล้ว`,
    `✓ สำเร็จ: **${success}** คน`,
    failed > 0 ? `❌ Error: **${failed}** คน` : null,
  ].filter(Boolean);

  return interaction.editReply({ content: lines.join('\n') });
}

async function handleKickThreadCancel(interaction) {
  const token = interaction.customId.split(':')[1];
  pendingKick.delete(token);
  return interaction.update({ content: '❌ ยกเลิกแล้ว', embeds: [], components: [] });
}

module.exports = {
  startInvite, handleInviteSelect, handleInviteConfirm, handleInviteCancel,
  handleKickThreadCmd, handleKickThreadConfirm, handleKickThreadCancel,
};
