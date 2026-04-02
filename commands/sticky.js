// commands/sticky.js
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { setSetting } = require('../db/settings');
const { refreshSticky, stopSticky } = require('../handlers/stickyHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sticky')
    .setDescription('จัดการ Sticky Message')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageMessages)

    // --- set ---
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('ตั้งค่า Sticky Message โดยดูดข้อมูลจาก Message ID')
        .addStringOption(opt =>
          opt.setName('message_id')
            .setDescription('ID ของข้อความเป้าหมาย (ต้องอยู่ในห้องเดียวกัน)')
            .setRequired(true)
        )
    )

    // --- stop ---
    .addSubcommand(sub =>
      sub.setName('stop')
        .setDescription('หยุดการทำงานของ Sticky Message ในห้องนี้และลบข้อความทิ้ง')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // ================================================================
    if (sub === 'set') {
      const msgId = interaction.options.getString('message_id');

      const targetMsg = await interaction.channel.messages.fetch(msgId).catch(() => null);
      if (!targetMsg) {
        return interaction.editReply('❌ ไม่พบข้อความนี้ในห้องครับ');
      }
      if (!targetMsg.content && !targetMsg.embeds.length && !targetMsg.components.length) {
        return interaction.editReply('❌ ข้อความเป้าหมายไม่มีข้อมูลอะไรเลย ดูดไม่ได้ครับ');
      }

      const config = {
        content:    targetMsg.content || null,
        embeds:     targetMsg.embeds.map(e => e.toJSON()),
        components: targetMsg.components.map(r => r.toJSON()),
      };

      try {
        await setSetting(interaction.guildId, `sticky_${interaction.channelId}`, config);
        await refreshSticky(interaction.channel);
        return interaction.editReply('✅ ตั้งค่าและอัปเดต Sticky Message เรียบร้อยแล้วครับ');
      } catch (err) {
        console.error(err);
        return interaction.editReply('❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล');
      }
    }

    // ================================================================
    if (sub === 'stop') {
      try {
        const success = await stopSticky(interaction.channel);
        return interaction.editReply(
          success
            ? '✅ หยุดการทำงานและลบ Sticky Message เรียบร้อยแล้วครับ'
            : '❌ ไม่พบ Sticky Message ที่รันอยู่ในห้องนี้ครับ'
        );
      } catch (err) {
        console.error(err);
        return interaction.editReply('❌ เกิดข้อผิดพลาดในการหยุดการทำงาน');
      }
    }
  },
};
