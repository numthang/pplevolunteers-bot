// handlers/forumDashboard.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getLatestPosts, getForumStats, getForumConfig, setDashboardMsgId } = require('../db/forum');

async function buildDashboardEmbed(guild, channelId, config) {
  const guildId   = guild.id;
  const channel   = guild.channels.cache.get(channelId);
  const chanName  = channel?.name ?? channelId;
  const perPage   = config.items_per_page ?? 10;

  const [posts, stats] = await Promise.all([
    getLatestPosts(guildId, channelId, 5),
    getForumStats(guildId, channelId),
  ]);

  const postLines = posts.length
    ? posts.map(p => `• [${p.post_name}](${p.post_url})`).join('\n')
    : '_ยังไม่มีโพสต์_';

  const now = new Date();
  const timeStr = now.toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`PPLE Forum — ${chanName}`)
    .setDescription('ค้นหาและเรียกดูโพสต์ในช่องนี้ได้เลย กดปุ่มด้านล่าง')
    .addFields(
      { name: 'โพสต์ล่าสุด', value: postLines },
      { name: 'โพสต์ทั้งหมด', value: `**${stats.total}**`,      inline: true },
      { name: 'เดือนนี้',      value: `**${stats.this_month}**`, inline: true },
      { name: 'วันนี้',        value: `**${stats.today}**`,      inline: true },
    )
    .setFooter({ text: `อัปเดตล่าสุด: ${timeStr}` });

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('forum_search')
        .setLabel('ค้นหาโพสต์')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔍'),
      new ButtonBuilder()
        .setCustomId(`forum_refresh_${channelId}`)
        .setLabel('รีเฟรช')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
    ),
  ];

  return { embed, components };
}

// handle ปุ่ม forum_refresh_{channelId}
async function handleRefresh(interaction) {
  const channelId = interaction.customId.replace('forum_refresh_', '');
  await interaction.deferUpdate();

  const config = await getForumConfig(interaction.guildId, channelId);
  if (!config?.dashboard_msg_id) return;

  const { embed, components } = await buildDashboardEmbed(interaction.guild, channelId, config);

  // dashboard_msg_id คือ thread ID — edit starter message
  const thread = interaction.guild.channels.cache.get(config.dashboard_msg_id);
  if (!thread) return;
  const starterMsg = await thread.fetchStarterMessage().catch(() => null);
  if (starterMsg) await starterMsg.edit({ embeds: [embed], components });
}

module.exports = { buildDashboardEmbed, handleRefresh };
