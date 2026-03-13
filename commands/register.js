// commands/register.js
const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const {getMember} = require('../db/members');//get member db

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('ลงทะเบียนสมาชิก'),

  async execute(interaction) {
    // ดึงข้อมูลเดิมจาก DB
    const existing = await getMember(interaction.user.id);

    const modal = new ModalBuilder()
      .setCustomId('modal_register')
      .setTitle('แนะนำตัวให้เพื่อนรู้จักสักนิด');

    const nameInput = new TextInputBuilder()
      .setCustomId('field_name')
      .setLabel('ชื่อ-นามสกุล')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('เช่น ณัฐพงษ์ เรืองปัญญาวุฒิ')
      .setRequired(true);

    // ถ้ามีข้อมูลเดิม ใส่ setValue
    if (existing?.firstname) {
      const fullname = [existing.firstname, existing.lastname].filter(Boolean).join(' ');
      nameInput.setValue(fullname);
    }

    const memberIdInput = new TextInputBuilder()
      .setCustomId('field_member_id')
      .setLabel('เลขสมาชิกพรรค (ถ้ามี)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('เช่น 6000000001')
      .setRequired(false);

    // ถ้ามีข้อมูลเดิม ใส่ setValue
    if(existing?.member_id) memberIdInput.setValue(existing.member_id);

    const nicknameInput = new TextInputBuilder()
      .setCustomId('field_nickname')
      .setLabel('ชื่อเล่น')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('เช่น เท้ง')
      .setRequired(true);

    // ถ้ามีข้อมูลเดิม ใส่ setValue
    if (existing?.nickname) nicknameInput.setValue(existing.nickname);

    const interestInput = new TextInputBuilder()
      .setCustomId('field_interest')
      .setLabel('ความสนใจ / ความถนัด')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('เช่น ทีมกราฟิก, ทีมคอนเทนต์, อื่นๆ')
      .setRequired(true);

    // ถ้ามีข้อมูลเดิม ใส่ setValue
    if (existing?.specialty) interestInput.setValue(existing.specialty);
    
    const referredByInput = new TextInputBuilder()
      .setCustomId('field_referred_by')
      .setLabel('แนะนำโดย (ถ้ามี)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('เช่น ชื่อสมาชิกที่แนะนำ/Facbook/X/อื่นๆ')
      .setRequired(false);

    // ถ้ามีข้อมูลเดิม ใส่ setValue
    if (existing?.referred_by) referredByInput.setValue(existing.referred_by);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(memberIdInput),
      new ActionRowBuilder().addComponents(nicknameInput),
      new ActionRowBuilder().addComponents(interestInput),
      new ActionRowBuilder().addComponents(referredByInput),
    );

    await interaction.showModal(modal);
  },
};
