// commands/setup-register.js
const {SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-register')
    .setDescription('ติดตั้ง sticky message ลงทะเบียนใน channel นี้')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(option =>
      option
        .setName('log_channel')
        .setDescription('channel ที่จะส่ง log การลงทะเบียน (default: channel นี้)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ephemeral: true});

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

    const embed = new EmbedBuilder()
      .setTitle('📋 แนะนำตัวสมาชิก อาสาประชาชน')
      .setDescription('กดปุ่มด้านล่างเพื่อแนะนำตัวหรืออัปเดตข้อมูลของคุณได้เลย')
      .setColor(0x5865f3);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_open_register_modal')
        .setLabel('✍️ กดปุ่มนี้เพื่อเริ่มแนะนำตัว')
        .setStyle(ButtonStyle.Primary)
    );

    const sent = await interaction.channel.send({embeds: [embed], components: [row]});
    console.log(`📌 Sticky message ID: ${sent.id} in channel: ${interaction.channelId}`);
    interaction.client.stickyMessages.set(interaction.channelId, sent.id);

    const logMsg = logChannel.id !== interaction.channelId
    ? `✅ ติดตั้ง sticky message เรียบร้อยแล้ว\n📋 Log จะส่งไปที่ <#${logChannel.id}>`
    : '✅ ติดตั้ง sticky message เรียบร้อยแล้ว';
    
    await interaction.editReply({content: '✅ ติดตั้ง sticky message เรียบร้อยแล้วครับ'});
  },
};
