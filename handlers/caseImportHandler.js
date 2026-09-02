// handlers/caseImportHandler.js — นำเข้ากระทู้ Discord เป็นเคสร้องเรียน
const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags,
} = require('discord.js');
const caseDb = require('../db/case');
const { fetchAllMessages } = require('../services/fetchMessages');
const { generateTimeline } = require('../services/caseTimeline');

/**
 * เลขเคสในข้อความบอท **ต้องเป็นลิงก์กลับหน้าจัดการเสมอ** (user เคาะ 2026-09-01)
 * — ตั้งค่า web_base_url ยังไม่ได้ตั้ง → ตกกลับเป็นตัวหนาเฉยๆ ดีกว่าไม่มีข้อความ
 * คู่แฝดฝั่งเว็บ: `caseRefLink()` ใน `web/lib/caseDiscord.js` (แก้ต้องแก้คู่กัน)
 */
async function refLink(guildId, ref) {
  const url = await caseDb.getCaseManageUrl(guildId, ref).catch(() => null);
  return url ? `[${ref}](${url})` : `**${ref}**`;
}

/** เปิด modal ให้กรอกจังหวัด/ประเภท ก่อนสร้างเคส */
async function handleCaseImportStart(interaction) {
  const thread = interaction.channel;
  const threadName = thread?.name || 'เรื่องร้องเรียน';
  const caseConfig = await caseDb.getCaseConfig(interaction.guildId);
  const defaultProvince = caseConfig?.default_province || '';

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
  const provinceInput = interaction.fields.getTextInputValue('province').trim();
  const category = interaction.fields.getTextInputValue('category').trim() || null;

  const province = caseDb.normalizeProvinceName(provinceInput);
  if (!province) {
    return interaction.editReply({ content: `❌ จังหวัด "${provinceInput}" ไม่ถูกต้อง กรุณาลองใหม่` });
  }

  // กันซ้ำ: กระทู้นี้ถูกนำเข้าแล้วหรือยัง
  const existing = await caseDb.getCaseByThreadId(threadId);
  if (existing) {
    return interaction.editReply({ content: `⚠️ กระทู้นี้ถูกนำเข้าเป็นเคส ${await refLink(interaction.guildId, existing.ref)} แล้ว`, flags: MessageFlags.SuppressEmbeds });
  }

  // complainant = เจ้าของกระทู้ (ถ้าดึงได้)
  const ownerId = thread.ownerId || interaction.user.id;
  const ownerMember = await interaction.guild.members.fetch(ownerId).catch(() => null);
  const complainantName = ownerMember?.displayName || 'ไม่ระบุ';

  // ⛔ ไม่ทำ AI สรุปแล้ว (user เคาะ 2026-09-01 "ไม่เอา ไม่ต้องทำ เอาออกไป")
  //    ยังต้องดึงข้อความอยู่ เพราะ lastMsgId คือ watermark ของ timeline
  //    (ไม่ตั้ง = กด refresh timeline ทีหลังจะไล่สกัดซ้ำตั้งแต่ข้อความแรก)
  let lastMsgId = null;
  try {
    const messages = await fetchAllMessages(thread);
    if (messages.length) lastMsgId = messages[messages.length - 1].id;
  } catch (e) {
    console.error('[caseImport] fetch messages', e.message);
  }

  const row = await caseDb.createCase({
    guild_id: interaction.guildId, province, category, title, source: 'discord',
    complainant_name: complainantName, complainant_phone: null,
    discord_thread_id: threadId, created_by: interaction.user.id,
    created_at: thread.createdAt || null, // เคสนำเข้าย้อนหลัง → ใช้วันที่ตั้งกระทู้จริง ไม่ใช่เวลาที่กดนำเข้า
  });
  if (lastMsgId) await caseDb.setLastSyncedMessageId(row.id, lastMsgId);

  // AI timeline (best-effort)
  try {
    const messages = await fetchAllMessages(thread);
    const events = await generateTimeline(title, messages, { guildId: interaction.guildId });
    if (events.length) await caseDb.addTimelineEvents(row.id, interaction.guildId, events, 'ai');
  } catch (e) {
    console.error('[caseImport] timeline', e.message);
  }

  // โพสต์ยืนยันในเธรด
  try {
    const refLabel = await refLink(interaction.guildId, row.ref);
    await thread.send({
      content: `📋 นำเข้าเป็นเคสร้องเรียนแล้ว · รหัส ${refLabel} · จังหวัด ${province}${category ? ` · ${category}` : ''}`,
      flags: MessageFlags.SuppressEmbeds,
    });
  } catch { /* best-effort */ }

  return interaction.editReply({ content: `✅ สร้างเคส ${await refLink(interaction.guildId, row.ref)} จากกระทู้นี้แล้ว`, flags: MessageFlags.SuppressEmbeds });
}

/**
 * auto-import เมื่อสร้างกระทู้ใหม่ใน complaint forum channel
 * เรียกจาก index.js threadCreate event หลังจาก forum indexing เสร็จ
 */
async function handleThreadCreate(thread) {
  try {
    const config = await caseDb.getCaseConfig(thread.guildId);
    if (!config?.forum_channel_id || thread.parentId !== config.forum_channel_id) return;

    // กันซ้ำ
    const existing = await caseDb.getCaseByThreadId(thread.id);
    if (existing) return;

    const province = config.default_province || 'ไม่ระบุ';
    const title = thread.name || 'เรื่องร้องเรียน';

    // เจ้าของกระทู้
    const ownerId = thread.ownerId;
    const ownerMember = ownerId ? await thread.guild.members.fetch(ownerId).catch(() => null) : null;
    const complainantName = ownerMember?.displayName || 'ไม่ระบุ';

    // รอ message แรกโหลด แล้วดึง detail
    await new Promise(r => setTimeout(r, 2000));
    let detail = null;
    let lastMsgId = null;
    let messages = [];   // ต้องอยู่นอก try — ข้างล่างใช้ทำ AI timeline ต่อ
    try {
      messages = await fetchAllMessages(thread);
      if (messages.length) {
        detail = messages[0].content || null;
        lastMsgId = messages[messages.length - 1].id;
      }
    } catch (e) {
      console.error('[caseImport] threadCreate fetch messages', e.message);
    }

    const row = await caseDb.createCase({
      guild_id: thread.guildId, province, category: null, title,
      detail, source: 'discord', complainant_name: complainantName,
      complainant_phone: null, discord_thread_id: thread.id, created_by: ownerId || null,
    });
    if (lastMsgId) await caseDb.setLastSyncedMessageId(row.id, lastMsgId);

    // AI timeline (best-effort)
    try {
      if (messages?.length) {
        const events = await generateTimeline(title, messages, { guildId: thread.guildId });
        if (events.length) await caseDb.addTimelineEvents(row.id, thread.guildId, events, 'ai');
      }
    } catch (e) { console.error('[caseImport] threadCreate timeline', e.message); }

    const refLabel = await refLink(thread.guildId, row.ref);
    await thread.send({
      content: `📋 เข้าระบบเรื่องร้องเรียนแล้ว · รหัส ${refLabel} · จังหวัด ${province}`,
      flags: MessageFlags.SuppressEmbeds,
    }).catch(() => {});
  } catch (err) {
    console.error('[caseImport] handleThreadCreate:', err.message);
  }
}

module.exports = { handleCaseImportStart, handleCaseImportModal, handleThreadCreate };
