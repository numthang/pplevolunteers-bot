const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { startRecording, stopRecording, isRecording } = require('../utils/voiceRecorder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('record')
    .setDescription('บันทึกเสียงใน voice channel')
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('เริ่มบันทึกเสียง')
    )
    .addSubcommand(sub =>
      sub.setName('stop')
        .setDescription('หยุดบันทึกเสียงและรับลิงก์ไฟล์')
    ),

  async execute(interaction) {
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const member  = interaction.member;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // ── START ──────────────────────────────────────
    if (sub === 'start') {
      const voiceChannel = member.voice?.channel;

      if (!voiceChannel) {
        return interaction.editReply({ content: '❌ คุณต้องอยู่ใน voice channel ก่อนนะครับ' });
      }

      if (isRecording(guildId)) {
        return interaction.editReply({ content: '❌ มี session ที่กำลัง record อยู่แล้วครับ' });
      }

      try {
        await startRecording(voiceChannel, interaction.channel);
      } catch (err) {
        return interaction.editReply({ content: `❌ ${err.message}` });
      }

      return interaction.editReply({
        content: [
          `🎙 เริ่มบันทึกเสียงใน **${voiceChannel.name}** แล้วครับ`,
          `⏹ พิมพ์ \`/record stop\` เมื่อต้องการหยุด`,
          `⏱ หยุดอัตโนมัติถ้าไม่มีเสียงนาน 10 นาที`,
        ].join('\n'),
      });
    }

    // ── STOP ───────────────────────────────────────
    if (sub === 'stop') {
      if (!isRecording(guildId)) {
        return interaction.editReply({ content: '❌ ไม่มี session ที่กำลัง record อยู่ครับ' });
      }

      await interaction.editReply({ content: '⏳ กำลังหยุดบันทึก...' });
      await stopRecording(guildId, interaction.channel, '⏹ หยุดบันทึกโดยผู้ใช้');
    }
  },
};
