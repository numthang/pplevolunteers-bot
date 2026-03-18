// commands/setup-register.js (ทำแค่ส่ง embed + save config)
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { setSetting } = require('../db/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-register')
    .setDescription('ติดตั้งระบบแนะนำตัวใน')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(o => o.setName('title').setDescription('หัวข้อ embed').setRequired(false))
    .addStringOption(o => o.setName('description').setDescription('ข้อความ embed (ใช้ \\n)').setRequired(false))
    .addStringOption(o => o.setName('button_label').setDescription('ข้อความปุ่ม').setRequired(false))
    .addStringOption(o => o.setName('color').setDescription('สี hex').setRequired(false))
    .addChannelOption(o => o.setName('log_channel').setDescription('channel ส่ง log').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const title       = interaction.options.getString('title') ?? '📋 แนะนำตัวสมาชิก อาสาประชาชน';
    const description = (interaction.options.getString('description') ?? 'กดปุ่มด้านล่างเพื่อแนะนำตัวหรืออัปเดตข้อมูลของคุณได้เลย').replace(/\\n/g, '\n');
    const buttonLabel = interaction.options.getString('button_label') ?? '📋 แนะนำตัว/แก้ไขข้อมูล';
    const colorInput  = interaction.options.getString('color');
    const color       = colorInput ? parseInt(colorInput.replace('#', ''), 16) : 0x5865f3;
    const logChannel  = interaction.options.getChannel('log_channel') ?? interaction.channel;

    /* interaction.client.logChannel = logChannel; */
    // เซฟตั้งค่าห้อง Log ของระบบ Register แยกต่างหาก
    await setSetting(interaction.guildId, 'config_register', { log_channel_id: logChannel.id });

    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
          .setCustomId('btn_open_register_modal')
          .setLabel(buttonLabel)
          .setStyle(ButtonStyle.Primary)
      );
    const sent = await interaction.channel.send({ embeds: [embed], components: [row] });

    /* // สร้าง Array มารองรับ Components
    const components = [];
    // เช็คว่าถ้าใส่ชื่อปุ่มและ ID ปุ่มมา ถึงจะสร้างปุ่มยัดลงไป
    if (buttonLabel && buttonId) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(buttonId)
          .setLabel(buttonLabel)
          .setStyle(ButtonStyle.Primary)
      );
      components.push(row);
    }
    
    // ตอนส่งข้อความ ให้ใช้ components
    const sent = await channel.send({
      embeds: [embed],
      components: components, // ถ้าเป็นประกาศเปล่าๆ ไม่มีปุ่ม ตรงนี้มันจะส่งเป็น Array ว่างๆ บอทจะไม่พังครับ
    }); */

    /* // บันทึก config ลง DB
    const key = `sticky_${interaction.channelId}`;
    await setSetting(interaction.guildId, key, {
      channel_id: interaction.channelId,
      message_id: sent.id,
      title,
      description,
      button_label: buttonLabel,
      color,
      log_channel_id: logChannel.id
    }); */

    await interaction.editReply({ content: `✅ ติดตั้งระบบแนะนำตัวเรียบร้อย!\nLog → ${logChannel.id === interaction.channelId ? 'channel นี้' : `<#${logChannel.id}>`}` });
  },
};