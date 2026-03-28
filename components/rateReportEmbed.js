const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
// components/rateReportEmbed.js

/**
 * สร้าง embed + ปุ่ม สำหรับ rate/report
 * ใช้ร่วมกันระหว่าง /rate-user และ context menu
 *
 * @param {import('discord.js').User} targetUser
 * @param {string} targetDisplayName
 * @param {{ title?: string|null, description?: string|null }} [options]
 */
function buildRateReportEmbed(targetUser, targetDisplayName, options = {}) {
  const { title = null, description = null } = options;

  const embed = new EmbedBuilder()
    .setColor(0xf4c430)
    .setTitle(title ?? '⭐ ให้คะแนน / ร้องเรียน')
    .setDescription(description ?? `<@${targetUser.id}>`)
    .setThumbnail(targetUser.displayAvatarURL());

  // แถว 1: ปุ่มดาว 1-5
  const starRow = new ActionRowBuilder().addComponents(
    ...[1, 2, 3, 4, 5].map(n =>
      new ButtonBuilder()
        .setCustomId(`rate_stars:${n}:${targetUser.id}`)
        .setLabel('⭐'.repeat(n))
        .setStyle(ButtonStyle.Primary)
    )
  );

  // แถว 2: ปุ่มร้องเรียน
  const reportRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`report_start:${targetUser.id}`)
      .setLabel('🚨 ร้องเรียน')
      .setStyle(ButtonStyle.Danger)
  );

  return { embed, components: [starRow, reportRow] };
}

module.exports = { buildRateReportEmbed };