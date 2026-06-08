// handlers/aiThreadHandler.js
// context menu "🤖 AI สรุปเธรด" — right-click ในเธรด → AI อ่านทั้งเธรด
// ผลออกมาเป็นไฟล์ download (เหมือน /message fetch แต่ไม่ต้องพิมพ์) + ปุ่มหยิบลงตะกร้า

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  MessageFlags,
} = require('discord.js');
const crypto = require('crypto');
const { fetchAllMessages } = require('../services/fetchMessages');
const { processMessages } = require('../services/aiSummarize');
const { getModes, getMode } = require('../db/aiConfig');
const { setCaption, getBasket } = require('../db/mediaBasket');
const { buildBasketPayload, stripDiscordMarkdown } = require('./basketHandler');

const REPLY_LIMIT = 1800;
const CUSTOM_VALUE = '__custom__';

// เก็บผล AI ชั่วคราว ให้ปุ่มหยิบลงตะกร้าหยิบไปใช้
const outputCache = new Map(); // token → { caption, guildId, channelId, expiresAt }
const TTL_MS = 15 * 60 * 1000;

function putOutput(data) {
  const token = crypto.randomBytes(8).toString('hex');
  outputCache.set(token, { ...data, expiresAt: Date.now() + TTL_MS });
  return token;
}
function takeOutput(token) {
  const v = outputCache.get(token);
  if (!v) return null;
  if (Date.now() > v.expiresAt) { outputCache.delete(token); return null; }
  return v;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of outputCache) if (now > v.expiresAt) outputCache.delete(k);
}, TTL_MS).unref?.();

// ─── 1. กด context menu → เลือก mode ──────────────────────────────────────────
async function handleAiThreadStart(interaction) {
  const modes = await getModes(interaction.guildId);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ai_thread_mode')
    .setPlaceholder('เลือกรูปแบบที่ต้องการ')
    .addOptions([
      ...modes.map(m => ({ label: m.label, value: m.value })),
      { label: '✍️ กำหนด prompt เอง', value: CUSTOM_VALUE },
    ]);

  await interaction.reply({
    content: '🤖 จะให้ AI ประมวลผลเธรดนี้เป็นแบบไหน?',
    components: [new ActionRowBuilder().addComponents(menu)],
    flags: MessageFlags.Ephemeral,
  });
}

// ─── 2. เลือก mode ────────────────────────────────────────────────────────────
async function handleAiThreadModeSelect(interaction) {
  const modeValue = interaction.values[0];

  if (modeValue === CUSTOM_VALUE) {
    const seed = await getMode(interaction.guildId, 'social_post');
    const input = new TextInputBuilder()
      .setCustomId('ai_thread_prompt')
      .setLabel('Prompt (แก้ได้ตามใจ)')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(seed?.prompt || '')
      .setMaxLength(4000)
      .setRequired(true);
    const modal = new ModalBuilder()
      .setCustomId(`ai_thread_custom:${Date.now()}`) // timestamp กัน Discord cache prefill เก่า
      .setTitle('กำหนด prompt เอง')
      .addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  await interaction.update({ content: '⏳ กำลังดึงข้อความจากเธรด...', components: [] });
  return runAiOnThread(interaction, { modeValue });
}

// ─── 2b. submit modal custom prompt ───────────────────────────────────────────
async function handleAiThreadCustomModal(interaction) {
  const raw = interaction.fields.getTextInputValue('ai_thread_prompt')?.trim();
  await interaction.update({ content: '⏳ กำลังดึงข้อความจากเธรด...', components: [] });
  if (!raw) return runAiOnThread(interaction, { modeValue: 'social_post' });
  return runAiOnThread(interaction, { customPrompt: raw });
}

// ─── fetch ทั้งเธรด → AI → ไฟล์ download + preview + ปุ่มหยิบลงตะกร้า ────────────
async function runAiOnThread(interaction, { modeValue = null, customPrompt = null }) {
  const channel = interaction.channel;

  let messages;
  try {
    messages = await fetchAllMessages(channel);
  } catch (err) {
    return interaction.editReply({ content: `❌ ดึงข้อความไม่ได้: ${err.message}`, components: [] });
  }

  if (!messages.length) {
    return interaction.editReply({ content: '❌ ไม่พบข้อความในเธรดนี้', components: [] });
  }

  messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  await interaction.editReply({ content: `🤖 กำลังให้ AI ประมวลผล ${messages.length} ข้อความ...` });

  let result;
  try {
    const threadSuffix = !customPrompt && modeValue === 'social_post'
      ? 'ถ้ามีหลายเรื่องที่โพสต์ได้ ให้เขียนแยกทุกเรื่อง อย่ารวบเป็นโพสต์เดียว และอย่าเลือกมาแค่เรื่องเดียว'
      : null;
    result = await processMessages(interaction.guildId, messages, modeValue, channel.name, customPrompt, threadSuffix);
  } catch (err) {
    return interaction.editReply({ content: `⚠️ AI ประมวลผลไม่สำเร็จ: ${err.message}`, components: [] });
  }

  const { mode, output, truncated } = result;
  const body = output.length > REPLY_LIMIT ? output.slice(0, REPLY_LIMIT) + '\n…(ตัด — ดูไฟล์)' : output;

  // ไฟล์ download (ผล AI เต็มๆ)
  const date = new Date().toISOString().slice(0, 10);
  const file = new AttachmentBuilder(Buffer.from(output, 'utf8'), { name: `ai_${mode.value}_${date}.txt` });

  const token = putOutput({ caption: output, guildId: interaction.guildId, channelId: interaction.channelId, modeLabel: mode.label, modeValue: mode.value, msgCount: messages.length, truncated });
  const addBtn = new ButtonBuilder()
    .setCustomId(`ai_thread_caption:${token}`)
    .setLabel('🧺 ใช้เป็น caption ในตะกร้า')
    .setStyle(ButtonStyle.Success);
  const publicBtn = new ButtonBuilder()
    .setCustomId(`ai_thread_public:${token}`)
    .setLabel('📢 แสดงใน public')
    .setStyle(ButtonStyle.Primary);

  const header = `${mode.label}${truncated ? ' (บางส่วน)' : ''} · ${messages.length} ข้อความ`;
  await interaction.editReply({
    content: `${header}\n${'─'.repeat(20)}\n${body}`,
    files: [file],
    components: [new ActionRowBuilder().addComponents(addBtn, publicBtn)],
  });
}

// ─── 3. กดหยิบลงตะกร้า → แทนที่ caption → เปิดตะกร้า ──────────────────────────
async function handleAiThreadAddCaption(interaction) {
  const token = interaction.customId.split(':')[1];
  const data  = takeOutput(token);

  if (!data) {
    return interaction.reply({ content: '❌ ผลลัพธ์หมดอายุแล้ว — กด AI ใหม่', flags: MessageFlags.Ephemeral });
  }

  // ตะกร้าสื่อไม่เอา markdown — AI สรุปเธรดออกมาเป็นโพสต์จบแล้ว → แทนที่ caption
  const caption = stripDiscordMarkdown(data.caption);
  await setCaption(data.guildId, data.channelId, interaction.user.id, caption, null);
  outputCache.delete(token);

  const basket  = await getBasket(data.guildId, data.channelId);
  const payload = await buildBasketPayload(basket, data.guildId, data.channelId, interaction.user.id);
  await interaction.reply({
    content: '✅ หยิบลงตะกร้าสื่อแล้ว (แทนที่ caption เดิม)',
    ...payload,
    flags: MessageFlags.Ephemeral,
  });
}

// ─── 4. กดแสดงใน public → post ผล AI ออกช่องสาธารณะ ──────────────────────────
async function handleAiThreadPublic(interaction) {
  const token = interaction.customId.split(':')[1];
  const data  = takeOutput(token);

  if (!data) {
    return interaction.reply({ content: '❌ ผลลัพธ์หมดอายุแล้ว — กด AI ใหม่', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferUpdate();

  const body = data.caption.length > REPLY_LIMIT ? data.caption.slice(0, REPLY_LIMIT) + '\n…(ตัด — ดูไฟล์)' : data.caption;
  const date = new Date().toISOString().slice(0, 10);
  const file = new AttachmentBuilder(Buffer.from(data.caption, 'utf8'), { name: `ai_${data.modeValue}_${date}.txt` });
  const header = `${data.modeLabel}${data.truncated ? ' (บางส่วน)' : ''} · ${data.msgCount} ข้อความ`;

  await interaction.followUp({ content: `${header}\n${'─'.repeat(20)}\n${body}`, files: [file] });

  // disable ปุ่ม public หลังกด ป้องกัน post ซ้ำ
  const disabledPublic = new ButtonBuilder()
    .setCustomId(`ai_thread_public:${token}`)
    .setLabel('📢 แสดงใน public แล้ว')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);
  const addBtn = new ButtonBuilder()
    .setCustomId(`ai_thread_caption:${token}`)
    .setLabel('🧺 ใช้เป็น caption ในตะกร้า')
    .setStyle(ButtonStyle.Success);
  await interaction.editReply({ components: [new ActionRowBuilder().addComponents(addBtn, disabledPublic)] });
}

module.exports = { handleAiThreadStart, handleAiThreadModeSelect, handleAiThreadCustomModal, handleAiThreadAddCaption, handleAiThreadPublic };
