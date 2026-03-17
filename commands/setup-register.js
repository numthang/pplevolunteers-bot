// commands/setup-register.js
const {SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits} = require('discord.js');
const { setSetting } = require('../db/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-register')
    .setDescription('ติดตั้ง message แนะนำตัวใน channel นี้')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addBooleanOption(o => o
      .setName('sticky')
      .setDescription('ให้ message ลอยขึ้นมาทุกครั้งที่มีข้อความใหม่ (default: true)')
      .setRequired(false)
    )
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
    await interaction.deferReply({ephemeral: true});

    if (!interaction.client.stickyMessages) interaction.client.stickyMessages = new Map();

    const sticky      = interaction.options.getBoolean('sticky') ?? true;
    const title       = interaction.options.getString('title')        ?? '📋 แนะนำตัวสมาชิกอาสาประชาชน';
    const description = interaction.options.getString('description')  ?? 'กดปุ่มด้านล่างเพื่อแนะนำตัวหรืออัปเดตข้อมูลของคุณได้เลย';
    const buttonLabel = interaction.options.getString('button_label') ?? '✍️ กดปุ่มนี้เพื่อเริ่มแนะนำตัว';
    const colorInput  = interaction.options.getString('color');
    const color       = colorInput ? parseInt(colorInput.replace('#', ''), 16) : 0x5865f3;

    // เก็บ log channel
    const logChannel = interaction.options.getChannel('log_channel') ?? interaction.channel;
    interaction.client.logChannel = logChannel;
    console.log(`📋 Log channel: ${logChannel.name} | Sticky: ${sticky}`);

    // ถ้า sticky ให้ลบ message เดิมก่อน
    if (sticky) {
      const oldId = interaction.client.stickyMessages.get(interaction.channelId);
      if (oldId) {
        try {
          const old = await interaction.channel.messages.fetch(oldId);
          await old.delete();
        } catch {}
      }
    }

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

    // ส่ง message ทุกกรณี
    const sent = await interaction.channel.send({embeds: [embed], components: [row]});
    console.log(`📌 Message ID: ${sent.id} in channel: ${interaction.channelId}`);

    if (sticky) {
      interaction.client.stickyMessages.set(interaction.channelId, sent.id);
    } else {
      interaction.client.stickyMessages.delete(interaction.channelId);
    }

    const logMsg = logChannel.id !== interaction.channelId
      ? `✅ ตั้งค่าเรียบร้อยแล้ว\n📋 Log จะส่งไปที่ <#${logChannel.id}>`
      : '✅ ตั้งค่าเรียบร้อยแล้ว';

    await interaction.editReply({content: logMsg});

    // ... ในฟังก์ชัน execute หลังส่งข้อความ (sent) สำเร็จ ...
    if (sticky) {
      // ... ใน execute() หลังส่งข้อความ (sent) สำเร็จ ...
      const key = `sticky_${interaction.channelId}`;
      const stickyConfig = {
          channel_id: interaction.channelId,
          log_channel_id: logChannel.id, // 🔥 ต้องมีค่านี้เก็บไว้ใน JSON ด้วย
          message_id: sent.id,
          title: title,
          description: description.replace(/\\n/g, '\n'),
          button_label: buttonLabel,
          color: isNaN(color) ? 0x5865f3 : color
      };

      await setSetting(interaction.guildId, key, stickyConfig);
    }
  },
};