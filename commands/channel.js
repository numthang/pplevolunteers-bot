// commands/channel.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('จัดการ channel (เฉพาะ Moderator)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)

    // --- cleanup ---
    .addSubcommand(sub =>
      sub.setName('cleanup')
        .setDescription('กวาดล้างข้อความในช่องนี้')
        .addIntegerOption(opt =>
          opt.setName('amount')
            .setDescription('จำนวนข้อความที่ต้องการลบ (1-100, default: 100)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(100)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ================================================================
    if (sub === 'cleanup') {
      const amount = interaction.options.getInteger('amount') ?? 100;

      try {
        const deleted = await interaction.channel.bulkDelete(amount, true);

        const embed = new EmbedBuilder()
          .setColor('#ff4444')
          .setTitle('🧹 Cleanup Success')
          .setDescription(`กวาดล้างไปทั้งหมด **${deleted.size}** ข้อความ`)
          .setFooter({ text: `โดย: ${interaction.user.tag}` });

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch {
        return interaction.reply({
          content: 'ลบไม่ได้ครับ! อาจเพราะข้อความเก่าเกิน 14 วัน หรือบอทไม่มีสิทธิ์',
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};
