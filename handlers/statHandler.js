// handlers/statHandler.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { getTopMembers, getTopChannels, getServerOverview } = require('../db/stat');

const SCORE_MSG     = 10;
const SCORE_MENTION = 20;

const VIEW_OPTIONS = [
  { label: 'Overview',             value: 'overview',  emoji: '📊' },
  { label: 'Top Message Members',  value: 'msg_mem',   emoji: '💬' },
  { label: 'Top Voice Members',    value: 'voice_mem', emoji: '🔊' },
  { label: 'Top Message Channels', value: 'msg_ch',    emoji: '#️⃣' },
  { label: 'Top Voice Channels',   value: 'voice_ch',  emoji: '🔉' },
];

const DAYS_OPTIONS = [
  { label: '30 วัน',  value: '30'  },
  { label: '60 วัน',  value: '60'  },
  { label: '90 วัน',  value: '90'  },
  { label: '180 วัน', value: '180' },
  { label: '365 วัน', value: '365' },
];

function formatVoice(seconds) {
  const s = Number(seconds);
  if (s < 60)   return `${s}m`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// customId format:
//   view dropdown: stat_top:v:{days}:{roleId}
//   days dropdown: stat_top:d:{view}:{roleId}
//   user days:     stat_user:{userId}

function buildTopComponents(view, days, topN = 10) {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`stat_top:v:${days}:${topN}`)
        .addOptions(VIEW_OPTIONS.map(opt => ({ ...opt, default: opt.value === view })))
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`stat_top:d:${view}:${topN}`)
        .addOptions(DAYS_OPTIONS.map(opt => ({ ...opt, default: opt.value === String(days) })))
    ),
  ];
}

function buildUserComponents(userId, days) {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`stat_user:${userId}`)
        .addOptions(DAYS_OPTIONS.map(opt => ({ ...opt, default: opt.value === String(days) })))
    ),
  ];
}

function formatMemberRows(rows) {
  if (!rows.length) return 'ไม่มีข้อมูลในช่วงนี้';

  const scores = rows.map(m => Number(m.messages) * SCORE_MSG + Number(m.voice_seconds) + Number(m.mentions) * SCORE_MENTION);

  return rows.map((m, i) => {
    const score = scores[i];
    return (
      `\`${i + 1}\` <@${m.user_id}> ` +
      `💬 ${Number(m.messages).toLocaleString()} · 🔊 ${formatVoice(m.voice_seconds)} · 📣 ${Number(m.mentions).toLocaleString()} · ⭐ ${score.toLocaleString()} pts`
    );
  }).join('\n');
}

async function buildTopEmbed(guild, view, days, topN = 10) {
  const guildId = guild.id;

  // ── Overview ──────────────────────────────────────────────────────
  if (view === 'overview') {
    const overviewN = Math.max(3, Math.ceil(topN / 1));
    const [overview, msgMem, voiceMem] = await Promise.all([
      getServerOverview(guildId, days),
      getTopMembers(guildId, days, overviewN, null, 'messages'),
      getTopMembers(guildId, days, overviewN, null, 'voice'),
    ]);

    const fmtMsgMem = msgMem.length
      ? msgMem.map((m, i) => `\`${i + 1}\` <@${m.user_id}> ${Number(m.messages).toLocaleString()} msgs`).join('\n')
      : '—';

    const fmtVoiceMem = voiceMem.length
      ? voiceMem.map((m, i) => `\`${i + 1}\` <@${m.user_id}> ${formatVoice(m.voice_seconds)}`).join('\n')
      : '—';

    return new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`📊 Server Statistics · ${guild.name}`)
      .setDescription(
        `ย้อนหลัง ${days} วัน  •  ` +
        `👥 ${Number(overview.active_users).toLocaleString()} active  •  ` +
        `💬 ${Number(overview.total_msgs).toLocaleString()} msgs  •  ` +
        `🔊 ${formatVoice(Number(overview.total_voice))}`
      )
      .addFields(
        { name: '💬 Members',  value: fmtMsgMem,   inline: true },
        { name: '🔊 Members',  value: fmtVoiceMem, inline: true },
      )
      .setThumbnail(guild.iconURL({ extension: 'png' }))
      .setTimestamp();
  }

  // ── Top Message Members ───────────────────────────────────────────
  if (view === 'msg_mem') {
    const rows = await getTopMembers(guildId, days, topN, null, 'messages');
    const lines = formatMemberRows(rows);

    return new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`📊 Server Statistics · ${guild.name}`)
      .setDescription(`💬 Top Message Members  •  ย้อนหลัง ${days} วัน\n\n${lines}`)
      .setTimestamp();
  }

  // ── Top Voice Members ─────────────────────────────────────────────
  if (view === 'voice_mem') {
    const rows = await getTopMembers(guildId, days, topN, null, 'voice');
    const lines = formatMemberRows(rows);

    return new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`📊 Server Statistics · ${guild.name}`)
      .setDescription(`🔊 Top Voice Members  •  ย้อนหลัง ${days} วัน\n\n${lines}`)
      .setTimestamp();
  }

  // ── Top Message Channels ──────────────────────────────────────────
  if (view === 'msg_ch') {
    const rows = await getTopChannels(guildId, days, topN, 'messages');
    const lines = rows.length
      ? rows.map((ch, i) => {
          const msgs = Number(ch.messages).toLocaleString();
          return `\`${i + 1}\` <#${ch.channel_id}> 💬 ${msgs} · 👥 ${ch.contributors} คน`;
        }).join('\n')
      : 'ไม่มีข้อมูลในช่วงนี้';

    return new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`📊 Server Statistics · ${guild.name}`)
      .setDescription(`#️⃣ Top Message Channels  •  ย้อนหลัง ${days} วัน\n\n${lines}`)
      .setTimestamp();
  }

  // ── Top Voice Channels ────────────────────────────────────────────
  if (view === 'voice_ch') {
    const rows = await getTopChannels(guildId, days, topN, 'voice');
    const lines = rows.length
      ? rows.map((ch, i) => {
          const voice = formatVoice(ch.voice_seconds);
          return `\`${i + 1}\` <#${ch.channel_id}> 🔊 ${voice} · 👥 ${ch.contributors} คน`;
        }).join('\n')
      : 'ไม่มีข้อมูลในช่วงนี้';

    return new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`📊 Server Statistics · ${guild.name}`)
      .setDescription(`🔉 Top Voice Channels  •  ย้อนหลัง ${days} วัน\n\n${lines}`)
      .setTimestamp();
  }
}

// ── Interaction Handlers ──────────────────────────────────────────────

async function handleStatTopSelect(interaction) {
  const parts = interaction.customId.split(':');
  const type  = parts[1]; // 'v' or 'd'
  const state = parts[2];
  const topN  = parseInt(parts[3] ?? '10');

  let view, days;
  if (type === 'v') {
    view = interaction.values[0];
    days = parseInt(state);
  } else {
    view = state;
    days = parseInt(interaction.values[0]);
  }

  await interaction.deferUpdate();

  const embed      = await buildTopEmbed(interaction.guild, view, days, topN);
  const components = buildTopComponents(view, days, topN);
  await interaction.editReply({ embeds: [embed], components });
}

async function handleStatUserSelect(interaction) {
  const userId = interaction.customId.split(':')[1];
  const days   = parseInt(interaction.values[0]);
  const { guild } = interaction;

  await interaction.deferUpdate();

  const target = await interaction.client.users.fetch(userId).catch(() => null);
  const member = await guild.members.fetch(userId).catch(() => null);

  const { getUserStats } = require('../db/stat');
  const { activity, topChannels, mentions } = await getUserStats(guild.id, userId, days, 5);

  function formatLastActive(dateStr) {
    if (!dateStr) return '—';
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    if (diff === 0) return 'วันนี้';
    if (diff === 1) return 'เมื่อวาน';
    return `${diff} วันที่แล้ว`;
  }

  const messages     = Number(activity.messages);
  const voiceSeconds = Number(activity.voice_seconds);
  const score        = messages * SCORE_MSG + voiceSeconds + mentions * SCORE_MENTION;

  const embed = new EmbedBuilder()
    .setColor(member?.displayHexColor ?? '#5865F2')
    .setTitle(`📊 Server Statistics · ${member?.displayName ?? target?.username ?? userId}`)
    .setDescription(`<@${userId}>  •  ย้อนหลัง ${days} วัน`)
    .setThumbnail(target?.displayAvatarURL({ extension: 'png', size: 64 }) ?? null)
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

  const components = buildUserComponents(userId, days);
  await interaction.editReply({ embeds: [embed], components });
}

module.exports = {
  buildTopEmbed,
  buildTopComponents,
  buildUserComponents,
  handleStatTopSelect,
  handleStatUserSelect,
};
