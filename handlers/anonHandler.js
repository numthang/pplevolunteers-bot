// handlers/anonHandler.js
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

async function showAnonModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId(`anon_submit:${interaction.channelId}`)
    .setTitle('ส่งข้อความแบบไม่ระบุตัวตน');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('anon_text')
        .setLabel('ข้อความ')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('พิมพ์หรือ copy แปะข้อความที่นี่...')
        .setRequired(true)
        .setMaxLength(2000)
    )
  );

  await interaction.showModal(modal);
}

module.exports = { showAnonModal };
