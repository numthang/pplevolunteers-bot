// commands/setup-interest.js
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-interest')
    .setDescription('ติดตั้งปุ่มเลือกความสนใจและความถนัดในห้องนี้')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(o => o.setName('title').setDescription('หัวข้อ embed').setRequired(false))
    .addStringOption(o => o.setName('description').setDescription('ข้อความ embed (ใช้ \\n)').setRequired(false))
    .addStringOption(o => o.setName('color').setDescription('สี hex').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const title       = interaction.options.getString('title') ?? '🎯 เลือกความสนใจและความถนัด';
    const description = (interaction.options.getString('description') ?? 'กดปุ่มด้านล่างเพื่อเลือกความสนใจและความถนัดของคุณ\nสามารถเพิ่มหรือถอดได้ตลอดเวลา').replace(/\\n/g, '\n');
    const colorInput  = interaction.options.getString('color');
    const color       = colorInput ? parseInt(colorInput.replace('#', ''), 16) : 0xf1c40f;

    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_open_interest')
        .setLabel('🎯 เลือกความสนใจ / ความถนัด')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
    await interaction.followUp({ content: '✅ ติดตั้งปุ่มเลือกความสนใจเรียบร้อย!' });
  },
};
