// commands/stat-server.js
// /stat-server — overview ของ server

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getServerOverview, getTopChannels } = require('../db/stat');

const DEFAULT_DAYS = 60;
const DEFAULT_TOP  = 5;

function formatVoice(seconds) {
  if (!seconds) return '—';
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stat-server')
    .setDescription('แสดงสถิติรวมของ server')
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
    const top      = interaction.options.getInteger('top')    ?? DEFAULT_TOP;
    const isPublic = interaction.options.getBoolean('public') ?? false;

    await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });

    const { guildId, guild } = interaction;
    const overview    = await getServerOverview(guildId, days);
    const topChannels = await getTopChannels(guildId, days, top);

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`📊 ${guild.name} — Server Stats`)
      .setDescription(`ย้อนหลัง ${days} วัน`)
      .addFields(
        {
          name: '📈 Overview',
          value: [
            `👥 Active members: **${Number(overview.active_users).toLocaleString()}**`,
            `💬 Total messages: **${Number(overview.total_msgs).toLocaleString()}**`,
            `🔊 Total voice: **${formatVoice(Number(overview.total_voice))}**`,
          ].join('\n'),
        },
        {
          name: `🏆 Top ${top} Channels`,
          value: topChannels.length
            ? topChannels.map((ch, i) =>
                `**${i + 1}.** <#${ch.channel_id}>  💬 ${Number(ch.messages).toLocaleString()}  👥 ${ch.contributors}`
              ).join('\n')
            : '—',
        }
      )
      .setThumbnail(guild.iconURL({ extension: 'png' }))
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
