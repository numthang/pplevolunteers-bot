// handlers/postImportHandler.js — นำเข้ากระทู้ Discord เป็นโพสต์ (posts module)
// mirror ของ handlers/caseImportHandler.js ด้าน UX/flow — แต่เขียนลง post_episodes ไม่ใช่ cases
const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags,
} = require('discord.js');
const { fetchAllMessages, messagesToPlainText } = require('../services/fetchMessages');
const { callAI } = require('../services/aiSummarize');
const { refreshAttachmentUrls } = require('../services/discordAttachments');
const { downloadPending } = require('../db/mediaBasket');
const { createImportedPost, attachImages } = require('../db/postsImport');

// รูปเท่านั้นสำหรับรุ่นแรก — ไม่รองรับวิดีโอ/ไฟล์อื่น (ขยายทีหลังได้ถ้าต้องการ)
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif)(?:[?#]|$)/i;
const MAX_IMAGES = 30; // กันดาวน์โหลดพรวดถ้ากระทู้ยาวมาก

const AI_SYSTEM = `คุณเป็นผู้ช่วยบรรณาธิการงานสื่อของพรรคการเมืองไทย
ผู้ใช้จะโยนบทสนทนาในกระทู้ Discord มาให้ — หลายคนคุยกัน มีข้อความปลีกย่อย/ทักทาย/ตอบกลับปนกันอยู่
งานของคุณคือกลั่นเนื้อหาทั้งหมดออกมาเป็น **โพสต์โซเชียล 1 โพสต์** ที่เอาไปโพสต์ได้จริงทันที
กติกา:
- ผลลัพธ์เป็นโพสต์เดียวเสมอ ห้ามซอยเป็นหลายโพสต์ ห้ามทำเป็นโครง/สรุปหัวข้อย่อย ห้ามเขียนเป็นบทสนทนา/ไดอะล็อก
- ดึงประเด็นสำคัญจากบทสนทนาให้ครบ เรียงลำดับให้อ่านรู้เรื่องเป็นเนื้อความเดียว ตัดคำทักทาย/คำฟุ่มเฟือย/ข้อความซ้ำออก
- ห้ามเพิ่มข้อเท็จจริง ตัวเลข ชื่อคน หรือข้ออ้างที่ไม่มีในบทสนทนา
- รักษาน้ำเสียง/จุดยืนของผู้พูดไว้ ไม่ต้องทำให้เป็นทางการกว่าเดิม
- เขียนเป็นย่อหน้าปกติ ไม่ใส่ markdown ไม่ใส่หัวข้อกำกับ
- title = ชื่อไว้หาเจอในระบบ (สั้น ตรงประเด็น) ไม่ใช่พาดหัวโฆษณา
- category = ชื่อหมวดสั้นๆ 1 ชื่อ (ใส่ null ถ้าไม่มั่นใจ)

ตอบเป็น JSON รูปแบบนี้เท่านั้น ห้ามมีข้อความอื่นนอก JSON:
{"category": "ชื่อหมวดหรือ null", "title": "ชื่อโพสต์", "body": "เนื้อหาโพสต์เต็ม"}`;

/** เปิด modal ให้กรอกหมวด (ไม่บังคับ) ก่อนนำเข้า — ใช้ได้เฉพาะข้อความในเธรด */
async function handlePostImportStart(interaction) {
  const thread = interaction.channel;
  if (!thread?.isThread?.()) {
    return interaction.reply({ content: '❌ ใช้ได้เฉพาะข้อความในกระทู้ (thread)', flags: MessageFlags.Ephemeral });
  }

  // timestamp ใน customId กัน Discord cache modal เก่า
  const modal = new ModalBuilder()
    .setCustomId(`post_import_modal:${interaction.channelId}:${Date.now()}`)
    .setTitle('นำเข้าเป็นโพสต์');

  const categoryInput = new TextInputBuilder()
    .setCustomId('category').setLabel('หมวด (ไม่บังคับ)').setStyle(TextInputStyle.Short)
    .setMaxLength(60).setRequired(false);

  modal.addComponents(new ActionRowBuilder().addComponents(categoryInput));
  await interaction.showModal(modal);
}

// ดึงรูปจากข้อความในกระทู้ — เก็บ messageId ต้นทางไว้ต่อรูป (ต่างข้อความกันได้)
function extractImages(messages) {
  const out = [];
  for (const m of messages) {
    for (const a of m.attachments) {
      if (IMAGE_EXT_RE.test(a.filename || a.url)) out.push({ url: a.url, messageId: m.message_id });
      if (out.length >= MAX_IMAGES) return out;
    }
  }
  return out;
}

// callAI ฝั่งบอทคืนข้อความดิบ ไม่ parse JSON ให้เหมือน askAiJson ฝั่งเว็บ — ต้อง parse+validate เอง
function parseAiJson(raw) {
  const cleaned = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let obj;
  try { obj = JSON.parse(cleaned); } catch { return null; }
  if (!obj || typeof obj.title !== 'string' || !obj.title.trim() || typeof obj.body !== 'string' || !obj.body.trim()) return null;
  return {
    title: obj.title.trim(),
    body: obj.body.trim(),
    category: typeof obj.category === 'string' && obj.category.trim() ? obj.category.trim() : null,
  };
}

/** submit modal → AI สรุปกระทู้เป็นโพสต์ + แนบรูป + ยืนยันในเธรด */
async function handlePostImportModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const threadId = interaction.customId.split(':')[1];
  const thread = await interaction.guild.channels.fetch(threadId).catch(() => null);
  if (!thread) return interaction.editReply({ content: '❌ ไม่พบกระทู้ต้นทาง' });

  const modalCategory = interaction.fields.getTextInputValue('category').trim() || null;

  const messages = await fetchAllMessages(thread);
  const text = messagesToPlainText(messages);
  if (!text.trim()) return interaction.editReply({ content: '❌ ไม่มีข้อความในกระทู้นี้ให้สรุป' });

  const images = extractImages(messages);

  let ai = null;
  try {
    const raw = await callAI(AI_SYSTEM, `หัวข้อกระทู้: ${thread.name || ''}\n\nบทสนทนา:\n\n${text}`, { guildId: interaction.guildId });
    ai = parseAiJson(raw);
  } catch (e) {
    console.error('[postImport] ai', e.message);
  }
  // ล้ม = ไม่สร้างโพสต์เลย (ไม่เดาต่อ) — เหมือนหลักการของ web/app/api/posts/ai/compose
  if (!ai) return interaction.editReply({ content: '❌ AI ตอบกลับมาไม่ตรงรูปแบบ กรุณาลองใหม่อีกครั้ง' });

  let post;
  try {
    post = await createImportedPost({
      guildId: interaction.guildId,
      addedByDiscordId: interaction.user.id,
      category: modalCategory || ai.category,
      title: ai.title,
      body: ai.body,
      sourceIdea: text,
      createdAt: thread.createdAt || null, // นำเข้ากระทู้เก่า → ใช้วันที่ตั้งกระทู้จริง ไม่ใช่เวลาที่กดนำเข้า
    });
    if (images.length) await attachImages(post.id, interaction.user.id, images);
  } catch (e) {
    console.error('[postImport] create', e.message);
    return interaction.editReply({ content: '❌ สร้างโพสต์ไม่สำเร็จ' });
  }

  const webUrl = process.env.WEB_BASE_URL ? `${process.env.WEB_BASE_URL.replace(/\/$/, '')}/posts/${post.id}` : null;
  try {
    await thread.send(`📝 นำเข้าเป็นโพสต์แล้ว${webUrl ? ` · [แก้ไข](${webUrl})` : ''}`);
  } catch { /* best-effort */ }

  await interaction.editReply({ content: `✅ สร้างโพสต์แล้ว${webUrl ? `\n${webUrl}` : ''}` });

  // โหลดรูปลงดิสก์แบบ fire-and-forget หลัง ack เสมอ — ห้ามให้ interaction รอไฟล์
  if (images.length) {
    downloadPending(post.id, { refreshUrls: urls => refreshAttachmentUrls(interaction.client, urls) })
      .catch(err => console.error('[postImport] โหลดรูปลงดิสก์ล้ม:', err.message));
  }
}

module.exports = { handlePostImportStart, handlePostImportModal };
