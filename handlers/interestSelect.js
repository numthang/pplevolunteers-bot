// handlers/interestSelect.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { SKILL_ROLES, MEDIA_TEAM_ROLE_ID, MEDIA_TEAM_TRIGGERS } = require('../config/roles');
const { syncMemberRoles } = require('../db/members');
const { getPickerRoles, getPickerGroup } = require('../db/guildRoles');

// MEDIA_TEAM special-case (กฎพิเศษ ไม่อยู่ใน DB model) — กดทีมกราฟิก/ช่างภาพ/คอนเทนต์/ตัดต่อ → แปะ ทีมสื่อ ด้วย
const MEDIA_TEAM_TRIGGER_IDS = new Set(MEDIA_TEAM_TRIGGERS.map(k => SKILL_ROLES[k]).filter(Boolean));

/**
 * สร้างปุ่มจาก DB rows [{ roleId, label, emoji }]
 * customId = `${prefix}:${roleId}` (role_id เสมอ — ทน rename)
 * opts: { disableAll, overrideRoleId, overrideHasRole } — optimistic UI
 */
function buildGroupedRows(rows, memberRoles, prefix, opts = {}) {
  const { disableAll = false, overrideRoleId = null, overrideHasRole = false } = opts;
  const out = [];
  let chunk = [];
  for (const b of rows) {
    let hasRole = b.roleId && memberRoles.cache.has(b.roleId);
    if (overrideRoleId === b.roleId) hasRole = overrideHasRole;
    const btn = new ButtonBuilder()
      .setCustomId(`${prefix}:${b.roleId}`)
      .setLabel(b.label)
      .setStyle(hasRole ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(disableAll);
    if (b.emoji) btn.setEmoji(b.emoji);
    chunk.push(btn);
    if (chunk.length === 4) { out.push(new ActionRowBuilder().addComponents(chunk)); chunk = []; }
  }
  if (chunk.length) out.push(new ActionRowBuilder().addComponents(chunk));
  return out;
}

async function handleInterestSelect(interaction) {
  if (!interaction.isButton()) return;

  const [prefix, ...idParts] = interaction.customId.split(':');
  if (!['interest', 'skill'].includes(prefix)) return;

  await interaction.deferUpdate();

  const roleId     = idParts.join(':'); // role_id (snowflake)
  const member     = interaction.member;
  const userId     = interaction.user.id;
  const dn         = member?.displayName ?? interaction.user?.username ?? '';
  const embedColor = prefix === 'interest' ? 0xf1c40f : 0x3498db;
  const emojiHead  = prefix === 'interest' ? '🎯' : '🛠️';

  // ดึง rows กลุ่มนี้จาก DB (re-render) + label ของปุ่มที่กด
  const rows       = await getPickerRoles(interaction.guild.id, prefix);
  const grp        = await getPickerGroup(interaction.guild.id, prefix);
  const groupLabel = grp?.label ?? (prefix === 'interest' ? 'ความสนใจ' : 'ความถนัด');
  const label      = rows.find(r => r.roleId === roleId)?.label ?? roleId;
  const embedTitle = `${emojiHead} ${groupLabel} · ${dn}`;

  const reRender   = () => buildGroupedRows(rows, member.roles, prefix);
  const optimistic = (flip) => buildGroupedRows(rows, member.roles, prefix, { disableAll: true, overrideRoleId: roleId, overrideHasRole: flip });

  function reply(description) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setTitle(embedTitle).setDescription(description).setColor(embedColor)],
      components: reRender(),
    });
  }

  // role หายจาก guild แล้ว (catalog stale) — fail-safe
  if (!interaction.guild.roles.cache.has(roleId)) return reply(`⚠️ ไม่พบ role นี้แล้ว`);

  const hasRole = member.roles.cache.has(roleId);

  // Optimistic: flip สีปุ่มทันที + disable ทั้ง group ป้องกัน double-click
  await interaction.editReply({
    embeds: [new EmbedBuilder().setTitle(embedTitle).setDescription('⏳ กำลังดำเนินการ...').setColor(embedColor)],
    components: optimistic(!hasRole),
  });

  try {
    if (hasRole) {
      await member.roles.remove(roleId);
      if (MEDIA_TEAM_TRIGGER_IDS.has(roleId)) {
        await member.fetch();
        const stillHas = [...MEDIA_TEAM_TRIGGER_IDS].some(id => id !== roleId && member.roles.cache.has(id));
        if (!stillHas) await member.roles.remove(MEDIA_TEAM_ROLE_ID).catch(() => {});
      }
    } else {
      await member.roles.add(roleId);
      if (MEDIA_TEAM_TRIGGER_IDS.has(roleId)) {
        await member.roles.add(MEDIA_TEAM_ROLE_ID).catch(() => {});
      }
    }

    await member.fetch();
    await syncMemberRoles(interaction.member);

    return reply(hasRole
      ? `🔴 <@${userId}> • ถอด role **${label}** ออกแล้ว`
      : `🟢 <@${userId}> • เพิ่ม role **${label}** แล้ว`);

  } catch (err) {
    console.error(`❌ toggle role ${label}:`, err);
    return reply(`❌ <@${userId}> • เกิดข้อผิดพลาดกับ role **${label}**`);
  }
}

module.exports = { handleInterestSelect, buildGroupedRows };
