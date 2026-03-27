// commands/setup-province.js
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
    .setName('setup-province')
    .setDescription('ติดตั้งปุ่มเลือกจังหวัดในห้องนี้')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(o => o.setName('title').setDescription('หัวข้อ embed').setRequired(false))
    .addStringOption(o => o.setName('description').setDescription('ข้อความ embed (ใช้ \\n)').setRequired(false))
    .addStringOption(o => o.setName('color').setDescription('สี hex').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const title       = interaction.options.getString('title') ?? '🗺️ เลือกจังหวัดของคุณ';
    const description = (interaction.options.getString('description') ?? 'กดปุ่มด้านล่างเพื่อเลือกจังหวัดของคุณ\nสามารถเปลี่ยนได้ตลอดเวลา').replace(/\\n/g, '\n');
    const colorInput  = interaction.options.getString('color');
    const color       = colorInput ? parseInt(colorInput.replace('#', ''), 16) : 0x3498db;

    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_open_province')
        .setLabel('🗺️ เลือกจังหวัด')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.editReply({ content: '✅ ติดตั้งปุ่มเลือกจังหวัดเรียบร้อย!' });
  },
};
