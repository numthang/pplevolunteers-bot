// commands/user.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { getRatingSummary, getRatingList, getRatingCount } = require('../db/ratings');
const pool = require('../db/index');

const PER_PAGE = 5;
const MEDALS   = ['🥇', '🥈', '🥉'];

function buildBar(count, total, width = 10) {
  if (total === 0) return '░'.repeat(width);
  const filled = Math.round((count / total) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function starStr(n) {
  return '⭐'.repeat(n) + '☆'.repeat(5 - n);
}

async function buildRatingsEmbed(guildId, target, page) {
  const summary = await getRatingSummary(guildId, target.id);
  const total   = Number(summary.total);
  const avg     = total > 0 ? summary.avg_stars : 0;

  const list       = await getRatingList(guildId, target.id, page, PER_PAGE);
  const totalCount = await getRatingCount(guildId, target.id);
  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));

  const distLines = [5, 4, 3, 2, 1].map(s => {
    const cnt = Number(summary[`s${s}`]) || 0;
    const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
    return `${s}⭐ ${buildBar(cnt, total)} ${pct}%`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xf4c430)
    .setTitle(`📊 คะแนนของ ${target.displayName}`)
    .setThumbnail(target.displayAvatarURL())
    .addFields({
      name: `${'⭐'.repeat(Math.round(avg))} **${avg} / 5.0**  •  รีวิวทั้งหมด ${total} รายการ`,
      value: `\`\`\`\n${distLines}\n\`\`\``,
    });

  if (list.length === 0) {
    embed.addFields({ name: '💬 ความคิดเห็น', value: '_ยังไม่มีความคิดเห็น_' });
  } else {
    embed.addFields(...list.map(r => ({
      name: `${starStr(r.stars)}  •  ${new Date(r.created_at).toLocaleDateString('th-TH')}`,
      value: r.comment ? `"${r.comment}"` : '_ไม่มีความคิดเห็น_',
    })));
  }

  embed.setFooter({ text: `หน้า ${page} / ${totalPages}` });
  return { embed, totalPages };
}

function buildPageRow(targetId, page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ratings_page:${targetId}:${page - 1}`)
      .setLabel('◀ ก่อนหน้า')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`ratings_page:${targetId}:${page + 1}`)
      .setLabel('ถัดไป ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('ข้อมูลสมาชิก (เฉพาะ Moderator)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)

    // --- rating ---
    .addSubcommand(sub =>
      sub.setName('rating')
        .setDescription('ดูคะแนนของสมาชิก')
        .addUserOption(opt =>
          opt.setName('user').setDescription('สมาชิกที่ต้องการดูคะแนน').setRequired(true)
        )
    )

    // --- ranking ---
    .addSubcommand(sub =>
      sub.setName('ranking')
        .setDescription('ดู Top Rating ของสมาชิกในแต่ละ Role')
        .addStringOption(opt =>
          opt.setName('role').setDescription('ชื่อ Role ที่ต้องการดู').setRequired(true).setAutocomplete(true)
        )
        .addIntegerOption(opt =>
          opt.setName('top').setDescription('จำนวนอันดับที่แสดง (default: 5, max: 20)').setRequired(false).setMinValue(1).setMaxValue(20)
        )
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const filtered = interaction.guild.roles.cache
      .filter(r => !r.managed && r.name !== '@everyone' && r.name.toLowerCase().includes(focused))
      .map(r => r.name)
      .sort((a, b) => a.localeCompare(b, 'th'))
      .slice(0, 25);
    await interaction.respond(filtered.map(name => ({ name, value: name })));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ================================================================
    if (sub === 'rating') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const target = interaction.options.getMember('user');
      if (!target) {
        return interaction.editReply({ content: '❌ ไม่พบสมาชิกคนนี้ในเซิร์ฟเวอร์' });
      }

      const page = 1;
      const { embed, totalPages } = await buildRatingsEmbed(interaction.guildId, target, page);
      const row = buildPageRow(target.id, page, totalPages);
      return interaction.editReply({ embeds: [embed], components: [row] });
    }

    // ================================================================
    if (sub === 'ranking') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const roleName = interaction.options.getString('role');
      const topN     = interaction.options.getInteger('top') ?? 5;

      await interaction.guild.members.fetch().catch(() => {});
      const guildRole = interaction.guild.roles.cache.find(r => r.name === roleName);
      const memberIds = guildRole ? [...guildRole.members.keys()] : [];

      if (!memberIds.length) {
        return interaction.editReply({ content: `📭 ยังไม่มีสมาชิกใน **${roleName}** ที่มี rating ครับ` });
      }

      const placeholders = memberIds.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT
          m.discord_id,
          COALESCE(m.nickname, m.username) AS display_name,
          ROUND(AVG(r.stars), 1) AS avg_stars,
          COUNT(r.id)            AS total
        FROM dc_members m
        JOIN dc_user_ratings r ON r.guild_id = m.guild_id AND r.target_id = m.discord_id
        WHERE m.guild_id = ? AND m.discord_id IN (${placeholders})
        GROUP BY m.discord_id, m.nickname, m.username
        HAVING total >= 1
        ORDER BY avg_stars DESC, total DESC
        LIMIT ${topN}`,
        [interaction.guildId, ...memberIds]
      );

      if (!rows.length) {
        return interaction.editReply({ content: `📭 ยังไม่มีสมาชิกใน **${roleName}** ที่มี rating ครับ` });
      }

      const lines = rows.map((row, i) => {
        const medal = MEDALS[i] ?? `${i + 1}.`;
        const stars = '⭐'.repeat(Math.round(row.avg_stars)) + ` **${row.avg_stars}**`;
        return `${medal} <@${row.discord_id}> — ${stars}  *(${row.total} รีวิว)*`;
      });

      const embed = new EmbedBuilder()
        .setColor(0xf4c430)
        .setTitle(`🏆 Top ${topN} Rating — ${roleName}`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `แสดง ${rows.length} อันดับ • เรียงตาม avg ดาว` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  },

  // export helpers ให้ ratingPage.js ใช้
  buildRatingsEmbed,
  buildPageRow,
};
