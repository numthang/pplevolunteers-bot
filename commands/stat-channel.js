// commands/stat-channel.js
// /stat-channel — stats ของ channel

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ChannelType } = require('discord.js');
const { getChannelStats } = require('../db/stat');

const DEFAULT_DAYS = 60;
const DEFAULT_TOP  = 5;

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
    .setName('stat-channel')
    .setDescription('แสดงสถิติของ channel')
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('channel ที่ต้องการดู (default: channel ปัจจุบัน)')
        .setRequired(false)
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildVoice,
          ChannelType.GuildForum,
          ChannelType.GuildStageVoice,
        )
    )
    .addIntegerOption(opt =>
      opt.setName('top')
        .setDescription(`จำนวน top members ที่แสดง (default ${DEFAULT_TOP})`)
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

    await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });

    const { guildId, guild } = interaction;

    let selectedChannel = interaction.options.getChannel('channel') ?? interaction.channel;
    if (selectedChannel.isThread()) {
      selectedChannel = selectedChannel.parent ?? selectedChannel;
    }

    const channelId = selectedChannel.id;
    const { overview, topUsers } = await getChannelStats(guildId, channelId, days, topN);

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`📊 <#${channelId}>`)
      .setDescription(`ย้อนหลัง ${days} วัน`)
      .addFields(
        {
          name: '📈 Overview',
          value: [
            `👥 Contributors: **${Number(overview.contributors).toLocaleString()}**`,
            `💬 Messages: **${Number(overview.total_msgs).toLocaleString()}**`,
            `🔊 Voice: **${formatVoice(Number(overview.total_voice))}**`,
            `🕐 Last active: **${formatLastActive(overview.last_active)}**`,
          ].join('\n'),
        },
        {
          name: `🏆 Top ${topN} Members`,
          value: topUsers.length
            ? topUsers.map((m, i) =>
                `**${i + 1}.** <@${m.user_id}>  💬 ${Number(m.messages).toLocaleString()}  🔊 ${formatVoice(Number(m.voice_seconds))}`
              ).join('\n')
            : '—',
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
