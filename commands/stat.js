// commands/stat.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ChannelType } = require('discord.js');
const {
  getTopMembers, getChannelStats,
  getUserStats, getInactiveMembers,
} = require('../db/stat');

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

function formatJoined(joinedAt) {
  if (!joinedAt) return '—';
  const diff = Math.floor((Date.now() - new Date(joinedAt).getTime()) / 86400000);
  if (diff === 0) return 'วันนี้';
  if (diff === 1) return 'เมื่อวาน';
  return `${diff} วันที่แล้ว`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stat')
    .setDescription('ดูสถิติต่างๆ')

    // --- leaderboard ---
    .addSubcommand(sub =>
      sub.setName('leaderboard')
        .setDescription('top active members ของ server')
        .addRoleOption(opt =>
          opt.setName('role').setDescription('filter เฉพาะ role นี้').setRequired(false)
        )
        .addIntegerOption(opt =>
          opt.setName('top').setDescription('จำนวน members ที่แสดง (default 10)').setRequired(false).setMinValue(1).setMaxValue(25)
        )
        .addIntegerOption(opt =>
          opt.setName('days').setDescription('ย้อนหลังกี่วัน (default 60)').setRequired(false).setMinValue(1).setMaxValue(365)
        )
        .addBooleanOption(opt =>
          opt.setName('public').setDescription('แสดงให้ทุกคนเห็น (default: เฉพาะคุณ)').setRequired(false)
        )
    )

    // --- channel ---
    .addSubcommand(sub =>
      sub.setName('channel')
        .setDescription('สถิติของ channel')
        .addChannelOption(opt =>
          opt.setName('channel').setDescription('channel ที่ต้องการดู (default: ปัจจุบัน)').setRequired(false)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildForum, ChannelType.GuildStageVoice)
        )
        .addIntegerOption(opt =>
          opt.setName('top').setDescription('จำนวน top members ที่แสดง (default 5)').setRequired(false).setMinValue(1).setMaxValue(25)
        )
        .addIntegerOption(opt =>
          opt.setName('days').setDescription('ย้อนหลังกี่วัน (default 60)').setRequired(false).setMinValue(1).setMaxValue(365)
        )
        .addBooleanOption(opt =>
          opt.setName('public').setDescription('แสดงให้ทุกคนเห็น (default: เฉพาะคุณ)').setRequired(false)
        )
    )

    // --- user ---
    .addSubcommand(sub =>
      sub.setName('user')
        .setDescription('สถิติของ member (default: ตัวเอง)')
        .addUserOption(opt =>
          opt.setName('user').setDescription('member ที่ต้องการดู').setRequired(false)
        )
        .addIntegerOption(opt =>
          opt.setName('top').setDescription('จำนวน top channels ที่แสดง (default 5)').setRequired(false).setMinValue(1).setMaxValue(25)
        )
        .addIntegerOption(opt =>
          opt.setName('days').setDescription('ย้อนหลังกี่วัน (default 60)').setRequired(false).setMinValue(1).setMaxValue(365)
        )
        .addBooleanOption(opt =>
          opt.setName('public').setDescription('แสดงให้ทุกคนเห็น (default: เฉพาะคุณ)').setRequired(false)
        )
    )

    // --- inactive ---
    .addSubcommand(sub =>
      sub.setName('inactive')
        .setDescription('members ที่ไม่มี activity ในช่วงที่กำหนด')
        .addRoleOption(opt =>
          opt.setName('role').setDescription('filter เฉพาะ role นี้ (default: ทั้ง server)').setRequired(false)
        )
        .addIntegerOption(opt =>
          opt.setName('days').setDescription('นับว่า inactive ถ้าไม่มี activity กี่วัน (default 30)').setRequired(false).setMinValue(1).setMaxValue(365)
        )
        .addIntegerOption(opt =>
          opt.setName('top').setDescription('จำนวนที่แสดง (default 20, max 50)').setRequired(false).setMinValue(1).setMaxValue(50)
        )
        .addBooleanOption(opt =>
          opt.setName('public').setDescription('แสดงให้ทุกคนเห็น (default: เฉพาะคุณ)').setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub      = interaction.options.getSubcommand();
    const days     = interaction.options.getInteger('days')   ?? (sub === 'inactive' ? 30 : 60);
    const topN     = interaction.options.getInteger('top')    ?? (sub === 'inactive' ? 20 : sub === 'leaderboard' ? 10 : 5);
    const isPublic = interaction.options.getBoolean('public') ?? false;
    const { guildId, guild } = interaction;

    await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });

    // ================================================================
    if (sub === 'leaderboard') {
      const role = interaction.options.getRole('role');
      await guild.members.fetch().catch(() => {});

      let roleMembers = null;
      if (role) {
        const guildRole = guild.roles.cache.get(role.id);
        if (guildRole) roleMembers = new Set(guildRole.members.keys());
      }

      const top = await getTopMembers(guildId, days, topN, roleMembers);

      const embed = new EmbedBuilder()
        .setColor(role?.hexColor ?? '#5865F2')
        .setTitle(role ? `🏆 Top ${topN} Active — ${role.name}` : `🏆 Top ${topN} Active — ทั้ง Server`)
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

      return interaction.editReply({ embeds: [embed] });
    }

    // ================================================================
    if (sub === 'channel') {
      let selectedChannel = interaction.options.getChannel('channel') ?? interaction.channel;
      if (selectedChannel.isThread()) selectedChannel = selectedChannel.parent ?? selectedChannel;

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

      return interaction.editReply({ embeds: [embed] });
    }

    // ================================================================
    if (sub === 'user') {
      const target = interaction.options.getUser('user') ?? interaction.user;
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

      return interaction.editReply({ embeds: [embed] });
    }

    // ================================================================
    if (sub === 'inactive') {
      const role = interaction.options.getRole('role');
      await guild.members.fetch().catch(() => {});

      let targetMembers;
      if (role) {
        const guildRole = guild.roles.cache.get(role.id);
        targetMembers = guildRole ? [...guildRole.members.values()] : [];
      } else {
        targetMembers = [...guild.members.cache.values()].filter(m => !m.user.bot);
      }

      if (!targetMembers.length) {
        return interaction.editReply({ content: 'ไม่พบ members ครับ' });
      }

      const memberIds = targetMembers.map(m => m.id);
      const activeIds = await getInactiveMembers(guildId, memberIds, days);

      const inactiveMembers = targetMembers
        .filter(m => !activeIds.has(m.id))
        .sort((a, b) => (a.joinedTimestamp ?? 0) - (b.joinedTimestamp ?? 0))
        .slice(0, topN);

      const totalInactive = targetMembers.filter(m => !activeIds.has(m.id)).length;

      const embed = new EmbedBuilder()
        .setColor('#95a5a6')
        .setTitle(role ? `👻 Inactive — ${role.name}` : '👻 Inactive — ทั้ง Server')
        .setDescription(
          `ไม่มี activity ใน ${days} วันที่ผ่านมา\n` +
          `พบทั้งหมด **${totalInactive}** คน — แสดง ${inactiveMembers.length} คน (เรียงจาก join นานสุด)\n\n` +
          (inactiveMembers.length
            ? inactiveMembers.map((m, i) =>
                `**${i + 1}.** <@${m.id}>  🗓 join ${formatJoined(m.joinedAt)}`
              ).join('\n')
            : 'ทุกคน active หมดเลยครับ 🎉')
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  },
};
