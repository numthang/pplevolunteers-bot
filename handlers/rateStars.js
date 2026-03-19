const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { addRating } = require('../db/ratings');

/**
 * Handler สำหรับ customId ที่ขึ้นต้นด้วย "rate_stars:" และ "rate_submit:"
 */
module.exports = {
  // ---- ปุ่มดาว → เปิด Modal ----
  async handleStarButton(interaction) {
    // customId: rate_stars:{stars}:{targetId}:{targetName}
    const [, stars, targetId, encodedName] = interaction.customId.split(':');
    const targetName = decodeURIComponent(encodedName);

    const modal = new ModalBuilder()
      .setCustomId(`rate_submit:${stars}:${targetId}:${encodedName}`)
      .setTitle(`ให้คะแนน ${'⭐'.repeat(Number(stars))} แก่ ${targetName}`);

    const commentInput = new TextInputBuilder()
      .setCustomId('comment')
      .setLabel('ความคิดเห็น (ไม่บังคับ)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('เขียนความคิดเห็นสั้นๆ เกี่ยวกับสมาชิกคนนี้...')
      .setMaxLength(300)
      .setRequired(false);

    modal.addComponents(new ActionRowBuilder().addComponents(commentInput));
    await interaction.showModal(modal);
  },

  // ---- Modal submit → INSERT ----
  async handleModalSubmit(interaction) {
    // customId: rate_submit:{stars}:{targetId}:{targetName}
    const [, starsStr, targetId, encodedName] = interaction.customId.split(':');
    const targetName = decodeURIComponent(encodedName);
    const stars = Number(starsStr);
    const comment = interaction.fields.getTextInputValue('comment').trim() || null;

    // ดึงชื่อจริง target จาก guild (อาจ update ชื่อแล้ว — snapshot ชื่อปัจจุบัน)
    let resolvedTargetName = targetName;
    try {
      const member = await interaction.guild.members.fetch(targetId);
      resolvedTargetName = member.displayName;
    } catch { /* ถ้า fetch ไม่ได้ใช้ชื่อจาก customId แทน */ }

    const result = await addRating({
      targetId,
      targetName: resolvedTargetName,
      raterId:   interaction.user.id,
      raterName: interaction.member?.displayName ?? interaction.user.username,
      stars,
      comment,
    });

    if (!result.success) {
      const msg = result.error === 'daily_limit'
        ? '⏳ คุณได้ให้คะแนนสมาชิกคนนี้แล้ววันนี้ กลับมาใหม่พรุ่งนี้ได้เลย!'
        : '❌ ไม่สามารถให้คะแนนตัวเองได้';
      return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({
      content: `✅ ให้ ${'⭐'.repeat(stars)} แก่ **${resolvedTargetName}** เรียบร้อยแล้ว!`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
