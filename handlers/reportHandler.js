const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} = require('discord.js');
const { addReport } = require('../db/reports');

const CATEGORIES = [
  { value: 'harassment',    label: '🚫 การคุกคาม/ข่มขู่' },
  { value: 'spam',          label: '📢 สแปม' },
  { value: 'fraud',         label: '💸 โกง/หลอกลวง' },
  { value: 'misconduct',    label: '⚠️ พฤติกรรมไม่เหมาะสม' },
  { value: 'impersonation', label: '👤 แอบอ้างตัวตน' },
  { value: 'other',         label: '📝 อื่นๆ' },
];

module.exports = {
  // ---- ปุ่ม 🚨 → เลือกหมวดหมู่ ----
  async handleReportStart(interaction) {
    try {
      const parts = interaction.customId.split(':');
      const targetId   = parts[1];
      const encodedName = parts.slice(2).join(':');
      const targetName = decodeURIComponent(encodedName);

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`report_category:${targetId}:${encodedName}`)
        .setPlaceholder('เลือกหมวดหมู่เหตุผล...')
        .addOptions(
          CATEGORIES.map(c =>
            new StringSelectMenuOptionBuilder()
              .setLabel(c.label)
              .setValue(c.value)
          )
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await interaction.reply({
        content: `🚨 ร้องเรียน **${targetName}** — เลือกหมวดหมู่:`,
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      console.error('handleReportStart error:', err);
      await interaction.reply({
        content: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  },

  // ---- เลือกหมวดหมู่ → เปิด Modal ----
  async handleReportCategory(interaction) {
    try {
      const parts = interaction.customId.split(':');
      const targetId    = parts[1];
      const encodedName = parts.slice(2).join(':');
      const targetName  = decodeURIComponent(encodedName);
      const category    = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`report_submit:${category}:${targetId}:${encodedName}`)
        .setTitle(`ร้องเรียน ${targetName}`);

      const detailInput = new TextInputBuilder()
        .setCustomId('detail')
        .setLabel('รายละเอียด')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('อธิบายเหตุการณ์ที่เกิดขึ้น...')
        .setMaxLength(1000)
        .setRequired(true);

      const evidenceInput = new TextInputBuilder()
        .setCustomId('evidence')
        .setLabel('หลักฐาน (ลิงก์/URL) — ไม่บังคับ')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://...')
        .setMaxLength(500)
        .setRequired(false);

      const anonymousInput = new TextInputBuilder()
        .setCustomId('anonymous')
        .setLabel('ไม่ระบุตัวตน? พิมพ์ "ใช่" หรือเว้นว่าง')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('ใช่ / (เว้นว่าง)')
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(detailInput),
        new ActionRowBuilder().addComponents(evidenceInput),
        new ActionRowBuilder().addComponents(anonymousInput),
      );

      await interaction.showModal(modal);
    } catch (err) {
      console.error('handleReportCategory error:', err);
    }
  },

  // ---- Modal submit → INSERT + แจ้ง Mod ----
  async handleReportSubmit(interaction) {
    try {
      const parts       = interaction.customId.split(':');
      const category    = parts[1];
      const targetId    = parts[2];
      const encodedName = parts.slice(3).join(':');
      const targetName  = decodeURIComponent(encodedName);

      const detail      = interaction.fields.getTextInputValue('detail').trim();
      const evidence    = interaction.fields.getTextInputValue('evidence').trim() || null;
      const anonInput   = interaction.fields.getTextInputValue('anonymous').trim().toLowerCase();
      const isAnonymous = anonInput === 'ใช่';

      // ดึงชื่อจริง target
      let resolvedTargetName = targetName;
      try {
        const member = await interaction.guild.members.fetch(targetId);
        resolvedTargetName = member.displayName;
      } catch { /* fallback */ }

      const reportId = await addReport({
        targetId,
        targetName:   resolvedTargetName,
        reporterId:   interaction.user.id,
        reporterName: interaction.member?.displayName ?? interaction.user.username,
        category,
        detail,
        evidence,
        isAnonymous,
      });

      // แจ้ง Mod ใน channel ลับ
      const modChannelId = process.env.MOD_REPORT_CHANNEL_ID;
      if (modChannelId) {
        const modChannel = interaction.guild.channels.cache.get(modChannelId);
        if (modChannel) {
          const categoryLabel = {
            harassment:    '🚫 การคุกคาม/ข่มขู่',
            spam:          '📢 สแปม',
            fraud:         '💸 โกง/หลอกลวง',
            misconduct:    '⚠️ พฤติกรรมไม่เหมาะสม',
            impersonation: '👤 แอบอ้างตัวตน',
            other:         '📝 อื่นๆ',
          }[category] ?? category;

          const { EmbedBuilder } = require('discord.js');
          const modEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle(`🚨 รายงานใหม่ #${reportId}`)
            .addFields(
              { name: '👤 ผู้ถูกร้องเรียน', value: `<@${targetId}> (${resolvedTargetName})`, inline: true },
              { name: '📌 หมวดหมู่', value: categoryLabel, inline: true },
              { name: '📝 รายละเอียด', value: detail },
              { name: '🔗 หลักฐาน', value: evidence ?? '_ไม่มี_', inline: true },
              { name: '👁️ ผู้ร้องเรียน', value: isAnonymous ? '_Anonymous_' : `<@${interaction.user.id}>`, inline: true },
            )
            .setTimestamp();

          await modChannel.send({ embeds: [modEmbed] });
        }
      }

      await interaction.reply({
        content: `✅ ส่งเรื่องร้องเรียน **${resolvedTargetName}** เรียบร้อยแล้ว${isAnonymous ? ' (ไม่ระบุตัวตน)' : ''}\nทีม Moderator จะตรวจสอบโดยเร็วที่สุด`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      console.error('handleReportSubmit error:', err);
      await interaction.reply({
        content: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  },
};
