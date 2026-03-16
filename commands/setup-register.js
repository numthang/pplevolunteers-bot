// commands/setup-register.js
const {SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-register')
    .setDescription('ติดตั้ง sticky message ลงทะเบียนใน channel นี้')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(o => o
      .setName('title')
      .setDescription('หัวข้อ embed (default: "📋 แนะนำตัวสมาชิก อาสาประชาชน")')
      .setRequired(false)
    )
    .addStringOption(o => o
      .setName('description')
      .setDescription('ข้อความใน embed (ใช้ \\n สำหรับขึ้นบรรทัดใหม่)')
      .setRequired(false)
    )
    .addStringOption(o => o
      .setName('button_label')
      .setDescription('ข้อความบนปุ่ม (default: "✍️ กดปุ่มนี้เพื่อเริ่มแนะนำตัว")')
      .setRequired(false)
    )
    .addStringOption(o => o
      .setName('color')
      .setDescription('สี embed เป็น hex เช่น #57f287 (default: #5865f3)')
      .setRequired(false)
    )
    .addChannelOption(o => o
      .setName('log_channel')
      .setDescription('channel ที่จะส่ง log (default: channel นี้)')
      .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.client.stickyMessages) interaction.client.stickyMessages = new Map();

    // ลบ sticky เดิมถ้ามี
    const oldId = interaction.client.stickyMessages.get(interaction.channelId);
    if (oldId) {
      try {
        const old = await interaction.channel.messages.fetch(oldId);
        await old.delete();
      } catch {}
    }

    // เก็บ log channel
    const logChannel = interaction.options.getChannel('log_channel') ?? interaction.channel;
    interaction.client.logChannel = logChannel;
    console.log(`📋 Log channel: ${logChannel.name}`);

    // custom embed
    const title       = interaction.options.getString('title')        ?? '📋 แนะนำตัวสมาชิก อาสาประชาชน';
    const description = interaction.options.getString('description')  ?? 'กดปุ่มด้านล่างเพื่อแนะนำตัวหรืออัปเดตข้อมูลของคุณได้เลย';
    const buttonLabel = interaction.options.getString('button_label') ?? '✍️ กดปุ่มนี้เพื่อเริ่มแนะนำตัว';
    const colorInput  = interaction.options.getString('color');
    const color       = colorInput ? parseInt(colorInput.replace('#', ''), 16) : 0x5865f3;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description.replace(/\\n/g, '\n'))
      .setColor(isNaN(color) ? 0x5865f3 : color);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_open_register_modal')
        .setLabel(buttonLabel)
        .setStyle(ButtonStyle.Primary)
    );

    const sent = await interaction.channel.send({ embeds: [embed], components: [row] });
    console.log(`📌 Sticky message ID: ${sent.id} in channel: ${interaction.channelId}`);
    interaction.client.stickyMessages.set(interaction.channelId, sent.id);

    const logMsg = logChannel.id !== interaction.channelId
    ? `✅ ติดตั้ง sticky message เรียบร้อยแล้ว\n📋 Log จะส่งไปที่ <#${logChannel.id}>`
    : '✅ ติดตั้ง sticky message เรียบร้อยแล้ว';

    await interaction.editReply({ content: `${logMsg}` });
  },
};
