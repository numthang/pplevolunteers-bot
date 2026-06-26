// handlers/caseImportHandler.js — นำเข้ากระทู้ Discord เป็นเคสร้องเรียน
const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags,
} = require('discord.js');
const { getSetting } = require('../db/settings');
const caseDb = require('../db/case');
const { fetchAllMessages, messagesToPlainText } = require('../services/fetchMessages');
const { callAI } = require('../services/aiSummarize');

const AI_SYSTEM = `คุณเป็นผู้ช่วยสรุปเรื่องร้องเรียนจากบทสนทนาใน Discord ให้ทีมงานเข้าใจเร็ว
- สรุปสั้น กระชับ เป็นกลาง ภาษาทางการเล็กน้อย
- ระบุ: ปัญหาคืออะไร · สถานที่/หน่วยงานที่เกี่ยวข้อง (ถ้ามี) · สิ่งที่ผู้ร้องต้องการ
- ห้ามแต่งเติมข้อมูลที่ไม่มีในบทสนทนา · ห้ามวิเคราะห์/ตัดสินบุคคลที่สาม
- ความยาวไม่เกิน 5-6 บรรทัด`;

/** เปิด modal ให้กรอกจังหวัด/ประเภท ก่อนสร้างเคส */
async function handleCaseImportStart(interaction) {
  const thread = interaction.channel;
  const threadName = thread?.name || 'เรื่องร้องเรียน';
  const defaultProvince = (await getSetting(interaction.guildId, 'case_default_province')) || '';

  // timestamp ใน customId กัน Discord cache modal เก่า
  const modal = new ModalBuilder()
    .setCustomId(`case_import_modal:${interaction.channelId}:${Date.now()}`)
    .setTitle('นำเข้าเป็นเคสร้องเรียน');

  const titleInput = new TextInputBuilder()
    .setCustomId('title').setLabel('หัวข้อเรื่อง').setStyle(TextInputStyle.Short)
    .setValue(threadName.slice(0, 100)).setMaxLength(300).setRequired(true);

  const provinceInput = new TextInputBuilder()
    .setCustomId('province').setLabel('จังหวัด (เช่น ราชบุรี)').setStyle(TextInputStyle.Short)
    .setMaxLength(100).setRequired(true);
  if (defaultProvince) provinceInput.setValue(String(defaultProvince));

  const categoryInput = new TextInputBuilder()
    .setCustomId('category').setLabel('ประเภท (ไม่บังคับ)').setStyle(TextInputStyle.Short)
    .setMaxLength(50).setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(provinceInput),
    new ActionRowBuilder().addComponents(categoryInput),
  );

  await interaction.showModal(modal);
}

/** submit modal → สร้างเคส + AI summary + โพสต์ยืนยันในเธรด */
async function handleCaseImportModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const parts = interaction.customId.split(':');
  const threadId = parts[1];
  const thread = await interaction.guild.channels.fetch(threadId).catch(() => null);
  if (!thread) return interaction.editReply({ content: '❌ ไม่พบกระทู้ต้นทาง' });

  const title = interaction.fields.getTextInputValue('title').trim();
  const province = interaction.fields.getTextInputValue('province').trim();
  const category = interaction.fields.getTextInputValue('category').trim() || null;

  if (!caseDb.provinceToCode(province)) {
    return interaction.editReply({ content: `❌ จังหวัด "${province}" ไม่ถูกต้อง กรุณาลองใหม่` });
  }

  // กันซ้ำ: กระทู้นี้ถูกนำเข้าแล้วหรือยัง
  const existing = await caseDb.getCaseByThreadId(threadId);
  if (existing) {
    return interaction.editReply({ content: `⚠️ กระทู้นี้ถูกนำเข้าเป็นเคส **${existing.ref}** แล้ว` });
  }

  // complainant = เจ้าของกระทู้ (ถ้าดึงได้)
  const ownerId = thread.ownerId || interaction.user.id;
  const ownerMember = await interaction.guild.members.fetch(ownerId).catch(() => null);
  const complainantName = ownerMember?.displayName || 'ไม่ระบุ';

  // AI summary จากเนื้อหากระทู้ (best-effort)
  let aiSummary = null;
  let lastMsgId = null;
  try {
    const messages = await fetchAllMessages(thread);
    if (messages.length) lastMsgId = messages[messages.length - 1].id;
    const text = messagesToPlainText(messages);
    if (text.trim()) aiSummary = await callAI(AI_SYSTEM, `หัวข้อ: ${title}\n\nบทสนทนา:\n\n${text}`);
  } catch (e) {
    console.error('[caseImport] ai summary', e.message);
  }

  const row = await caseDb.createCase({
    guild_id: interaction.guildId, province, category, title, source: 'discord',
    complainant_name: complainantName, complainant_phone: null,
    discord_thread_id: threadId, created_by: interaction.user.id,
  });
  if (aiSummary) await caseDb.setAiSummary(row.id, aiSummary, lastMsgId);
  else if (lastMsgId) await caseDb.setLastSyncedMessageId(row.id, lastMsgId);

  // โพสต์ยืนยันในเธรด
  try {
    await thread.send(`📋 นำเข้าเป็นเคสร้องเรียนแล้ว · รหัส **${row.ref}** · จังหวัด ${province}${category ? ` · ${category}` : ''}`);
  } catch { /* best-effort */ }

  return interaction.editReply({ content: `✅ สร้างเคส **${row.ref}** จากกระทู้นี้แล้ว${aiSummary ? ' (มี AI สรุปให้ในระบบ)' : ''}` });
}

module.exports = { handleCaseImportStart, handleCaseImportModal };
