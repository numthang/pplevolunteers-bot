const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getRatingSummary, getRatingList, getRatingCount } = require('../db/ratings');

const PER_PAGE = 5;

// ---- Helper: สร้าง bar chart แบบ Unicode ----
function buildBar(count, total, width = 10) {
  if (total === 0) return '░'.repeat(width);
  const filled = Math.round((count / total) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// ---- Helper: สร้าง star string ----
function starStr(n) {
  return '⭐'.repeat(n) + '☆'.repeat(5 - n);
}

// ---- สร้าง embed หลัก ----
async function buildRatingsEmbed(guildId, target, page) {
  const summary = await getRatingSummary(guildId, target.id);
  const total   = Number(summary.total);
  const avg     = total > 0 ? summary.avg_stars : 0;

  const list       = await getRatingList(guildId, target.id, page, PER_PAGE);
  const totalCount = await getRatingCount(guildId, target.id);
  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));

  // --- Summary section ---
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

  // --- Comment list section ---
  if (list.length === 0) {
    embed.addFields({ name: '💬 ความคิดเห็น', value: '_ยังไม่มีความคิดเห็น_' });
  } else {
    const commentFields = list.map(r => {
      const date = new Date(r.created_at).toLocaleDateString('th-TH');
      const starsDisplay = starStr(r.stars);
      const commentText = r.comment ? `"${r.comment}"` : '_ไม่มีความคิดเห็น_';
      return {
        // name: `${starsDisplay}  •  <@${r.rater_id}> (${r.rater_name})  •  ${date}`,
        name: `${starsDisplay}  •  ${date}`,  // ← เอา rater ออก
        value: commentText,
      };
    });
    embed.addFields(...commentFields);
  }

  embed.setFooter({ text: `หน้า ${page} / ${totalPages}` });
  return { embed, totalPages };
}

// ---- สร้างปุ่ม pagination ----
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
      .setDisabled(page >= totalPages)
  );
}

// ================================================================
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ratings')
    .setDescription('ดูคะแนนของสมาชิก (เฉพาะ Moderator)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('สมาชิกที่ต้องการดูคะแนน')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getMember('user');
    if (!target) {
      return interaction.editReply({ content: '❌ ไม่พบสมาชิกคนนี้ในเซิร์ฟเวอร์' });
    }

    const page = 1;
    const { embed, totalPages } = await buildRatingsEmbed(interaction.guildId, target, page);
    const row = buildPageRow(target.id, page, totalPages);

    await interaction.editReply({ embeds: [embed], components: [row] });
  },

  // export helpers ให้ ratingsPage.js ใช้
  buildRatingsEmbed,
  buildPageRow,
};