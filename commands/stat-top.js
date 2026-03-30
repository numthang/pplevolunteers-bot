// commands/stat-top.js
// /stat-top — top N members ทั้ง server (optional: filter by role)

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getTopMembers } = require('../db/stat');

const DEFAULT_DAYS  = 60;
const DEFAULT_TOP   = 10;
const SCORE_MSG     = 10;
const SCORE_MENTION = 30;

function formatVoice(seconds) {
  if (!seconds) return '—';
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stat-top')
    .setDescription('แสดง top active members ของ server')
    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('filter เฉพาะ role นี้')
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('top')
        .setDescription(`จำนวน members ที่แสดง (default ${DEFAULT_TOP})`)
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
    const role     = interaction.options.getRole('role');

    await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });

    const { guildId, guild } = interaction;
    await guild.members.fetch().catch(() => {});

    let roleMembers = null;
    if (role) {
      const guildRole = guild.roles.cache.get(role.id);
      if (guildRole) roleMembers = new Set(guildRole.members.keys());
    }

    const top = await getTopMembers(guildId, days, topN, roleMembers);

    const title = role
      ? `🏆 Top ${topN} Active — ${role.name}`
      : `🏆 Top ${topN} Active — ทั้ง Server`;

    const embed = new EmbedBuilder()
      .setColor(role?.hexColor ?? '#5865F2')
      .setTitle(title)
      .setDescription(
        `ย้อนหลัง ${days} วัน  •  Score = Messages × ${SCORE_MSG} + Voice Seconds + Mentions × ${SCORE_MENTION}\n` +
        (top.length
          ? top.map((m, i) => {
              const score = Number(m.messages) * SCORE_MSG + Number(m.voice_seconds) + Number(m.mentions) * SCORE_MENTION;
              return `**${i + 1}.** <@${m.user_id}>  💬 ${Number(m.messages).toLocaleString()}  🔊 ${formatVoice(Number(m.voice_seconds))}  📣 ${Number(m.mentions)}  ⭐ ${score.toLocaleString()} pts`;
            }).join('\n')
          : '\nไม่มีข้อมูล activity ในช่วงนี้ครับ')
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
