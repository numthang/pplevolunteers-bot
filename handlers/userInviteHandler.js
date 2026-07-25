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
} = require('discord.js');

const TTL_MS      = 5 * 60 * 1000; // preview อายุ 5 นาที
const MAX_TOKENS  = 40;
const MAX_SELECTS = 4;             // เพดาน action row (เหลือ 1 row ให้ปุ่ม)
const SKIP        = '__skip__';

// invite-id -> { userId, channelId, tokens:[{raw,status,chosen,candidates}], createdAt }
const pending = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of pending) if (now - s.createdAt > TTL_MS) pending.delete(id);
}, 60 * 1000).unref?.();

// แตก + ล้างขยะจากรายชื่อที่ paste มา (Excel/แชท): บรรทัด -, =, เบอร์โทร, @ นำหน้า ฯลฯ
function cleanTokens(raw) {
  return raw
    .split(/[,\n\t]+/)
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
    .trim();
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
  for (const s of memberStrings(m)) {
    let score = 0;
    if (s === tokenNorm) score = 1000;
    else if (s.startsWith(tokenNorm) || tokenNorm.startsWith(s))
      score = 850 - Math.abs(s.length - tokenNorm.length) * 5;
    else if (s.includes(tokenNorm) || tokenNorm.includes(s))
      score = 700 - Math.abs(s.length - tokenNorm.length) * 3;
    else {
      const dist = lev(s, tokenNorm);
      const maxLen = Math.max(s.length, tokenNorm.length);
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
    .filter(c => c.score >= 350)
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
    new ButtonBuilder().setCustomId(`invite_confirm:${id}`).setLabel('✅ ยืนยันโพสต์').setStyle(ButtonStyle.Success).setDisabled(nChosen === 0),
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

module.exports = { startInvite, handleInviteSelect, handleInviteConfirm, handleInviteCancel };
