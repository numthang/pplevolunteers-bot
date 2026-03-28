// commands/orgchart.js
// แสดง Top 10 active members ต่อ role
// /orgchart               → แสดงทุก role ใน DB
// /orgchart roles:ทีมA ทีมB → แสดงเฉพาะ role ที่ระบุ

const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
} = require('discord.js');

const { getConfig }                              = require('../db/orgchartConfig');
const { getUserActivity, getLastActive, getMentionStats } = require('../db/activity');
const { generateOrgChart }                       = require('../utils/generateOrgChart');

const TOP_N = 10;
const DAYS  = 30;

const MEDALS = ['🥇', '🥈', '🥉'];

function formatVoice(seconds) {
  if (!seconds) return '—';
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatReplyRate(rate) {
  if (rate == null) return '—';
  return `${Math.round(rate * 100)}%`;
}

function formatLastActive(dateStr) {
  if (!dateStr) return '—';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return 'วันนี้';
  if (diff === 1) return 'เมื่อวาน';
  return `${diff} วันที่แล้ว`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('orgchart')
    .setDescription('แสดง Top 10 active members ต่อ role')
    .addStringOption(opt =>
      opt.setName('roles')
        .setDescription('ชื่อ role ที่ต้องการ (เว้นวรรคคั่นหลาย role) ถ้าไม่ระบุ = ทุก role')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('output')
        .setDescription('รูปแบบ output')
        .setRequired(false)
        .addChoices(
          { name: '📊 Embed + รูปภาพ (default)', value: 'both'  },
          { name: '📝 Embed เท่านั้น',            value: 'embed' },
          { name: '🖼️ รูปภาพเท่านั้น',            value: 'image' },
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const config     = await getConfig(interaction.guildId);
    const outputMode = interaction.options.getString('output') ?? 'both';
    const rolesInput = interaction.options.getString('roles');

    if (!config.size) {
      return interaction.editReply({ content: '❌ ยังไม่มี config ครับ ลองรัน `/orgchart-scan` ก่อนนะครับ' });
    }

    // กรอง role ที่ต้องการ
    let targets = [...config.values()];
    if (rolesInput) {
      const keywords = rolesInput.split(/\s+/).map(k => k.toLowerCase());
      targets = targets.filter(r => keywords.some(k => r.roleName.toLowerCase().includes(k)));
      if (!targets.length) {
        return interaction.editReply({ content: `❌ ไม่พบ role ที่ตรงกับ "${rolesInput}" ใน config ครับ` });
      }
    }

    await interaction.guild.members.fetch().catch(() => {});

    let isFirst = true;

    for (const roleConfig of targets) {
      const guildRole = interaction.guild.roles.cache.get(roleConfig.roleId);
      if (!guildRole) continue;

      const channelIds = [
        ...roleConfig.textChannels.map(c => c.id),
        ...roleConfig.voiceChannels.map(c => c.id),
      ];

      if (!guildRole.members.size) continue;

      // ดึง activity ทุก member ใน role
      const memberStats = await Promise.all(
        [...guildRole.members.values()].map(async member => {
          const { messages, voiceSeconds } = await getUserActivity(
            interaction.guildId, member.id, channelIds, DAYS
          );
          const lastActive   = await getLastActive(interaction.guildId, member.id);
          const mentionStats = await getMentionStats(interaction.guildId, member.id, DAYS);
          return {
            userId:      member.id,
            displayName: member.displayName,
            avatarURL:   member.user.displayAvatarURL({ extension: 'png', size: 64 }),
            messages,
            voiceSeconds,
            score:       messages * 10 + voiceSeconds,
            replyRate:   mentionStats.replyRate,
            lastActive,
          };
        })
      );

      const top = memberStats.sort((a, b) => b.score - a.score).slice(0, TOP_N);
      if (!top.length || top[0].score === 0) continue;

      // ── Embed ────────────────────────────────────────────────────────────────
      const embed = new EmbedBuilder()
        .setColor(roleConfig.roleColor ?? '#5865F2')
        .setTitle(`📊 ${guildRole.name}`)
        .setDescription(`Top ${top.length} Active — ย้อนหลัง ${DAYS} วัน\n*Score = Messages × 10 + Voice Seconds*`)
        .setTimestamp();

      top.forEach((m, i) => {
        embed.addFields({
          name: `${MEDALS[i] ?? `#${i + 1}`} ${m.displayName}`,
          value: [
            `💬 ${m.messages} msgs`,
            `🔊 ${formatVoice(m.voiceSeconds)}`,
            `↩️ ${formatReplyRate(m.replyRate)}`,
            `🕐 ${formatLastActive(m.lastActive)}`,
            `⭐ ${m.score.toLocaleString()} pts`,
          ].join('  '),
        });
      });

      // ── Image ────────────────────────────────────────────────────────────────
      let attachment = null;
      if (outputMode !== 'embed') {
        try {
          const buf = await generateOrgChart(guildRole.name, roleConfig.roleColor, top);
          attachment = new AttachmentBuilder(buf, { name: 'orgchart.png' });
          if (outputMode !== 'image') embed.setImage('attachment://orgchart.png');
        } catch (err) {
          console.error('[orgchart] generateOrgChart error:', err);
        }
      }

      // ── Send ─────────────────────────────────────────────────────────────────
      const payload = {};
      if (outputMode !== 'image') payload.embeds = [embed];
      if (attachment)             payload.files  = [attachment];

      if (isFirst) {
        await interaction.editReply(payload);
        isFirst = false;
      } else {
        await interaction.followUp(payload);
      }
    }

    if (isFirst) {
      await interaction.editReply({ content: 'ℹ️ ไม่มีข้อมูล activity ในช่วง 30 วันที่ผ่านมาครับ' });
    }
  },
};
