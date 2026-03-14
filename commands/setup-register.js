// commands/setup-register.js
const {SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-register')
    .setDescription('ติดตั้ง sticky message ลงทะเบียนใน channel นี้')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

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

    const embed = new EmbedBuilder()
      .setTitle('📋 ลงทะเบียนสมาชิก อาสาประชาชน')
      .setDescription('กดปุ่มด้านล่างเพื่อลงทะเบียนหรืออัปเดตข้อมูลของคุณได้เลยครับ')
      .setColor(0x5865f3);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_open_register_modal')
        .setLabel('📋 ลงทะเบียน / แก้ไขข้อมูล')
        .setStyle(ButtonStyle.Primary)
    );

    const sent = await interaction.channel.send({embeds: [embed], components: [row]});
    console.log(`📌 Sticky message ID: ${sent.id} in channel: ${interaction.channelId}`);
    interaction.client.stickyMessages.set(interaction.channelId, sent.id);

    await interaction.editReply({content: '✅ ติดตั้ง sticky message เรียบร้อยแล้วครับ'});
  },
};
