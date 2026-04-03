// commands/stat.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUserStats, getInactiveMembers } = require('../db/stat');
const { buildTopEmbed, buildTopComponents, buildUserComponents } = require('../handlers/statHandler');

const SCORE_MSG     = 10;
const SCORE_MENTION = 20;

function formatVoice(seconds) {
  const s = Number(seconds);
  if (!s)       return '—';
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
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

    // --- top ---
    .addSubcommand(sub =>
      sub.setName('top')
        .setDescription('สถิติ top ของ server — เลือก view และช่วงเวลาได้ใน message')
        .addIntegerOption(opt =>
          opt.setName('top').setDescription('จำนวน members/channels ที่แสดง (default 10)').setRequired(false).setMinValue(1).setMaxValue(25)
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
    const isPublic = interaction.options.getBoolean('public') ?? false;
    const { guildId, guild } = interaction;

    // ================================================================
    if (sub === 'top') {
      const topN = interaction.options.getInteger('top') ?? 10;
      const days = 60;
      const view = 'msg_mem';

      await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });
      await guild.members.fetch().catch(() => {});

      const embed      = await buildTopEmbed(guild, view, days, topN);
      const components = buildTopComponents(view, days, topN);
      return interaction.editReply({ embeds: [embed], components });
    }

    // ================================================================
    if (sub === 'user') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const member = await guild.members.fetch(target.id).catch(() => null);
      const days   = 60;

      await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });

      const { activity, topChannels, mentions } = await getUserStats(guildId, target.id, days, 5);

      const messages     = Number(activity.messages);
      const voiceSeconds = Number(activity.voice_seconds);
      const score        = messages * SCORE_MSG + voiceSeconds + mentions * SCORE_MENTION;

      const embed = new EmbedBuilder()
        .setColor(member?.displayHexColor ?? '#5865F2')
        .setTitle(`📊 Server Statistics · ${member?.displayName ?? target.username}`)
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
            name: '🏆 Top 5 Channels',
            value: topChannels.length
              ? topChannels.map((ch, i) =>
                  `\`${i + 1}\` <#${ch.channel_id}> — 💬 ${Number(ch.messages).toLocaleString()} · 🔊 ${formatVoice(ch.voice_seconds)}`
                ).join('\n')
              : '—',
          }
        )
        .setTimestamp();

      const components = buildUserComponents(target.id, days);
      return interaction.editReply({ embeds: [embed], components });
    }

    // ================================================================
    if (sub === 'inactive') {
      const role  = interaction.options.getRole('role');
      const days  = interaction.options.getInteger('days') ?? 30;
      const topN  = interaction.options.getInteger('top')  ?? 20;

      await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });
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

      const memberIds    = targetMembers.map(m => m.id);
      const activeIds    = await getInactiveMembers(guildId, memberIds, days);
      const inactiveList = targetMembers
        .filter(m => !activeIds.has(m.id))
        .sort((a, b) => (a.joinedTimestamp ?? 0) - (b.joinedTimestamp ?? 0))
        .slice(0, topN);

      const totalInactive = targetMembers.filter(m => !activeIds.has(m.id)).length;

      const embed = new EmbedBuilder()
        .setColor('#95a5a6')
        .setTitle(role ? `👻 Inactive — ${role.name}` : '👻 Inactive — ทั้ง Server')
        .setDescription(
          `ไม่มี activity ใน ${days} วันที่ผ่านมา\n` +
          `พบทั้งหมด **${totalInactive}** คน — แสดง ${inactiveList.length} คน (เรียงจาก join นานสุด)\n\n` +
          (inactiveList.length
            ? inactiveList.map((m, i) =>
                `\`${i + 1}\` <@${m.id}>  🗓 join ${formatJoined(m.joinedAt)}`
              ).join('\n')
            : 'ทุกคน active หมดเลยครับ 🎉')
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  },
};
