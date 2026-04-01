// commands/stat-user.js
// /stat-user — stats ของ user (ไม่ระบุ = ตัวเอง)

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUserStats } = require('../db/stat');

const DEFAULT_DAYS  = 60;
const DEFAULT_TOP   = 5;
const SCORE_MSG     = 10;
const SCORE_MENTION = 20;

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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stat-user')
    .setDescription('แสดงสถิติของ member')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('member ที่ต้องการดู (default: ตัวเอง)')
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('top')
        .setDescription(`จำนวน top channels ที่แสดง (default ${DEFAULT_TOP})`)
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(25)
    )
    .addIntegerOption(opt =>
      opt.setName('days')
        .setDescription(`ย้อนหลังกี่วัน (default ${DEFAULT_DAYS})`)
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(365)
    )
    .addBooleanOption(opt =>
      opt.setName('public')
        .setDescription('แสดงให้ทุกคนเห็น (default: เฉพาะคุณ)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const days     = interaction.options.getInteger('days')   ?? DEFAULT_DAYS;
    const topN     = interaction.options.getInteger('top')    ?? DEFAULT_TOP;
    const isPublic = interaction.options.getBoolean('public') ?? false;
    const target   = interaction.options.getUser('user')      ?? interaction.user;

    await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });

    const { guildId, guild } = interaction;
    const member = await guild.members.fetch(target.id).catch(() => null);

    const { activity, topChannels, mentions } = await getUserStats(guildId, target.id, days, topN);

    const messages     = Number(activity.messages);
    const voiceSeconds = Number(activity.voice_seconds);
    const score        = messages * SCORE_MSG + voiceSeconds + mentions * SCORE_MENTION;

    const embed = new EmbedBuilder()
      .setColor(member?.displayHexColor ?? '#5865F2')
      .setTitle(`👤 ${member?.displayName ?? target.username}`)
      .setDescription(`<@${target.id}>  •  ย้อนหลัง ${days} วัน`)
      .setThumbnail(target.displayAvatarURL({ extension: 'png', size: 64 }))
      .addFields(
        {
          name: '📈 Activity',
          value: [
            `💬 Messages: **${messages.toLocaleString()}**`,
            `🔊 Voice: **${formatVoice(voiceSeconds)}**`,
            `📣 Mentions: **${mentions.toLocaleString()}**`,
            `🕐 Last active: **${formatLastActive(activity.last_active)}**`,
            `⭐ Score: **${score.toLocaleString()} pts**`,
          ].join('\n'),
        },
        {
          name: `🏆 Top ${topN} Channels`,
          value: topChannels.length
            ? topChannels.map((ch, i) =>
                `**${i + 1}.** <#${ch.channel_id}>  💬 ${Number(ch.messages).toLocaleString()}  🔊 ${formatVoice(Number(ch.voice_seconds))}`
              ).join('\n')
            : '—',
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
