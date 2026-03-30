// utils/orgchartEmbed.js

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getUserActivity, getLastActive, getMentionCount } = require('../db/activity');
const { generateOrgChart } = require('./generateOrgChart');

const MEDALS = ['🥇', '🥈', '🥉'];

const SCORE_MSG     = 10;
const SCORE_MENTION = 30;

function formatVoice(seconds) {
  if (!seconds) return '—';
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatLastActive(dateStr) {
  if (!dateStr) return '—';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return 'วันนี้';
  if (diff === 1) return 'เมื่อวาน';
  return `${diff} วันที่แล้ว`;
}

/**
 * ดึง activity stats ของทุก member ใน role แล้ว sort ตาม score
 */
async function getRoleStats(guildId, guild, roleConfig, { topN = 10, days = 30 } = {}) {
  const guildRole = guild.roles.cache.get(roleConfig.roleId);
  if (!guildRole || !guildRole.members.size) return [];

  const channelIds = [
    ...roleConfig.textChannels.map(c => c.id),
    ...roleConfig.voiceChannels.map(c => c.id),
  ];

  const memberStats = await Promise.all(
    [...guildRole.members.values()].map(async member => {
      const { messages, voiceSeconds } = await getUserActivity(guildId, member.id, channelIds, days);
      const mentions   = await getMentionCount(guildId, member.id, channelIds, days);
      const lastActive = await getLastActive(guildId, member.id);
      return {
        userId:      member.id,
        displayName: member.displayName,
        avatarURL:   member.user.displayAvatarURL({ extension: 'png', size: 64 }),
        messages,
        voiceSeconds,
        mentions,
        score:       messages * SCORE_MSG + voiceSeconds + mentions * SCORE_MENTION,
        lastActive,
      };
    })
  );

  return memberStats
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

/**
 * สร้าง embed จาก top members
 */
function buildOrgChartEmbed(roleConfig, top, { days = 30 } = {}) {
  const embed = new EmbedBuilder()
    .setColor(roleConfig.roleColor ?? '#5865F2')
    .setTitle(`📊 ${roleConfig.roleName}`)
    .setDescription(
      `<@&${roleConfig.roleId}> — Top ${top.length} Active — ย้อนหลัง ${days} วัน\n` +
      `*Score = Messages × ${SCORE_MSG} + Voice Seconds + Mentions × ${SCORE_MENTION}*`
    )
    .setTimestamp();

  top.forEach((m, i) => {
    embed.addFields({
      name: `${MEDALS[i] ?? `#${i + 1}`} ${m.displayName}`,
      value: [
        `<@${m.userId}>`,
        `💬 ${m.messages} msgs`,
        `🔊 ${formatVoice(m.voiceSeconds)}`,
        `📣 ${m.mentions} mentions`,
        `🕐 ${formatLastActive(m.lastActive)}`,
        `⭐ ${m.score.toLocaleString()} pts`,
      ].join('  '),
    });
  });

  return embed;
}

/**
 * สร้าง AttachmentBuilder จาก top members (รูปภาพ)
 */
async function buildOrgChartAttachment(roleConfig, top) {
  try {
    const buf = await generateOrgChart(roleConfig.roleName, roleConfig.roleColor, top);
    return new AttachmentBuilder(buf, { name: 'orgchart.png' });
  } catch (err) {
    console.error('[orgchartEmbed] generateOrgChart error:', err);
    return null;
  }
}

module.exports = { getRoleStats, buildOrgChartEmbed, buildOrgChartAttachment };