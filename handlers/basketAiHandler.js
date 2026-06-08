// handlers/basketAiHandler.js
// ปุ่ม 🤖 AI เรียบเรียง ในตะกร้าสื่อ — AI อ่าน caption ที่สะสมไว้ แล้วเขียนทับเป็นโพสต์

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const crypto = require('crypto');
const { processText } = require('../services/aiSummarize');
const { getModes, getMode } = require('../db/aiConfig');
const { setCaption, getBasket } = require('../db/mediaBasket');
const { buildBasketPayload, stripDiscordMarkdown } = require('./basketHandler');

const REPLY_LIMIT = 1800;
const CUSTOM_VALUE = '__custom__';

// เก็บผล AI ชั่วคราว ให้ปุ่ม "แทนที่ caption" หยิบไปใช้ (customId เก็บ text ยาวไม่ได้)
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

// ดึง caption ปัจจุบันในตะกร้า
async function getCaption(guildId, channelId) {
  const basket = await getBasket(guildId, channelId);
  return basket.find(r => r.type === 'caption')?.caption || '';
}

// ─── 1. กดปุ่ม 🤖 → เลือก mode ────────────────────────────────────────────────
async function handleBasketAiStart(interaction) {
  const caption = await getCaption(interaction.guildId, interaction.channelId);
  if (!caption.trim()) {
    return interaction.reply({ content: '❌ ยังไม่มี caption ในตะกร้าให้เรียบเรียง', flags: MessageFlags.Ephemeral });
  }

  const modes = await getModes(interaction.guildId);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('basket_ai_mode')
    .setPlaceholder('เลือกรูปแบบที่ต้องการ')
    .addOptions([
      ...modes.map(m => ({ label: m.label, value: m.value })),
      { label: '✍️ กำหนด prompt เอง', value: CUSTOM_VALUE },
    ]);

  await interaction.reply({
    content: '🤖 จะให้ AI ปรับ caption เป็นแบบไหน?',
    components: [new ActionRowBuilder().addComponents(menu)],
    flags: MessageFlags.Ephemeral,
  });
}

// ─── 2. เลือก mode ────────────────────────────────────────────────────────────
async function handleBasketAiModeSelect(interaction) {
  const modeValue = interaction.values[0];

  if (modeValue === CUSTOM_VALUE) {
    const seed = await getMode(interaction.guildId, 'social_post');
    const input = new TextInputBuilder()
      .setCustomId('basket_ai_prompt')
      .setLabel('Prompt (แก้ได้ตามใจ)')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(seed?.prompt || '')
      .setMaxLength(4000)
      .setRequired(true);
    const modal = new ModalBuilder()
      .setCustomId(`basket_ai_custom:${Date.now()}`) // timestamp กัน Discord cache prefill เก่า
      .setTitle('กำหนด prompt เอง')
      .addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  await interaction.update({ content: '⏳ กำลังให้ AI เรียบเรียง...', components: [] });
  return runAiOnCaption(interaction, { modeValue });
}

// ─── 2b. submit modal custom prompt ───────────────────────────────────────────
async function handleBasketAiCustomModal(interaction) {
  const raw = interaction.fields.getTextInputValue('basket_ai_prompt')?.trim();
  await interaction.update({ content: '⏳ กำลังให้ AI เรียบเรียง...', components: [] });
  if (!raw) return runAiOnCaption(interaction, { modeValue: 'social_post' });
  return runAiOnCaption(interaction, { customPrompt: raw });
}

// ─── อ่าน caption → AI → แสดงผล + ปุ่มแทนที่ ─────────────────────────────────
async function runAiOnCaption(interaction, { modeValue = null, customPrompt = null }) {
  const { guildId, channelId } = interaction;
  const caption = await getCaption(guildId, channelId);

  if (!caption.trim()) {
    return interaction.editReply({ content: '❌ ไม่มี caption ในตะกร้าแล้ว', components: [] });
  }

  const basketSuffix = !customPrompt && modeValue === 'social_post'
    ? 'สำคัญ: ให้เขียนโพสต์เดียวเท่านั้น รวมทุกแง่มุมของเนื้อหาไว้ในโพสต์เดียว ห้ามแยก'
    : null;

  let result;
  try {
    result = await processText(guildId, caption, modeValue, customPrompt, basketSuffix);
  } catch (err) {
    return interaction.editReply({ content: `⚠️ AI ประมวลผลไม่สำเร็จ: ${err.message}`, components: [] });
  }

  const { mode, output } = result;
  const body = output.length > REPLY_LIMIT ? output.slice(0, REPLY_LIMIT) + '\n…(ตัด)' : output;

  const token = putOutput({ caption: output, guildId, channelId });
  const replaceBtn = new ButtonBuilder()
    .setCustomId(`basket_ai_replace:${token}`)
    .setLabel('✅ แทนที่ caption')
    .setStyle(ButtonStyle.Success);
  const appendBtn = new ButtonBuilder()
    .setCustomId(`basket_ai_append:${token}`)
    .setLabel('➕ ต่อท้าย caption')
    .setStyle(ButtonStyle.Secondary);

  await interaction.editReply({
    content: `${mode.label}\n${'─'.repeat(20)}\n${body}`,
    components: [new ActionRowBuilder().addComponents(replaceBtn, appendBtn)],
  });
}

// ─── 3b. กดต่อท้าย → modal pre-fill original+AI ──────────────────────────────
async function handleBasketAiAppend(interaction) {
  const token = interaction.customId.split(':')[1];
  const data  = takeOutput(token);

  if (!data) {
    return interaction.reply({ content: '❌ ผลลัพธ์หมดอายุแล้ว — กด 🤖 ใหม่', flags: MessageFlags.Ephemeral });
  }

  const current = await getCaption(data.guildId, data.channelId);
  const aiText  = stripDiscordMarkdown(data.caption);
  const combined = current.trim() ? `${current}\n\n${aiText}` : aiText;
  const preview  = combined.length > 4000 ? combined.slice(0, 4000) : combined;

  const input = new TextInputBuilder()
    .setCustomId('basket_ai_append_text')
    .setLabel('Caption รวม (แก้ได้ก่อนบันทึก)')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(preview)
    .setMaxLength(4000)
    .setRequired(true);
  const modal = new ModalBuilder()
    .setCustomId(`basket_ai_append_modal:${Date.now()}`)
    .setTitle('ต่อท้าย caption')
    .addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

// ─── 3c. submit modal ต่อท้าย → save ─────────────────────────────────────────
async function handleBasketAiAppendModal(interaction) {
  const text = interaction.fields.getTextInputValue('basket_ai_append_text')?.trim();
  if (!text) return interaction.reply({ content: '❌ caption ว่าง', flags: MessageFlags.Ephemeral });

  await setCaption(interaction.guildId, interaction.channelId, interaction.user.id, text, null);

  const basket  = await getBasket(interaction.guildId, interaction.channelId);
  const payload = await buildBasketPayload(basket, interaction.guildId, interaction.channelId, interaction.user.id);
  await interaction.reply({ content: '✅ ต่อท้าย caption แล้ว', ...payload, flags: MessageFlags.Ephemeral });
}

// ─── 3. กดแทนที่ → modal pre-fill AI text ให้ confirm/แก้ก่อนบันทึก ────────────
async function handleBasketAiReplace(interaction) {
  const token = interaction.customId.split(':')[1];
  const data  = takeOutput(token);

  if (!data) {
    return interaction.reply({ content: '❌ ผลลัพธ์หมดอายุแล้ว — กด 🤖 ใหม่', flags: MessageFlags.Ephemeral });
  }

  const aiText = stripDiscordMarkdown(data.caption);
  const preview = aiText.length > 4000 ? aiText.slice(0, 4000) : aiText;

  const input = new TextInputBuilder()
    .setCustomId('basket_ai_replace_text')
    .setLabel('Caption ใหม่ (แก้ได้ก่อนบันทึก)')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(preview)
    .setMaxLength(4000)
    .setRequired(true);
  const modal = new ModalBuilder()
    .setCustomId(`basket_ai_replace_modal:${data.guildId}:${data.channelId}:${Date.now()}`)
    .setTitle('แทนที่ caption')
    .addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

// ─── 3d. submit modal แทนที่ → save ──────────────────────────────────────────
async function handleBasketAiReplaceModal(interaction) {
  const text = interaction.fields.getTextInputValue('basket_ai_replace_text')?.trim();
  if (!text) return interaction.reply({ content: '❌ caption ว่าง', flags: MessageFlags.Ephemeral });

  const [, guildId, channelId] = interaction.customId.split(':');
  await setCaption(guildId, channelId, interaction.user.id, text, null);

  const basket  = await getBasket(guildId, channelId);
  const payload = await buildBasketPayload(basket, guildId, channelId, interaction.user.id);
  await interaction.reply({ content: '✅ แทนที่ caption แล้ว', ...payload, flags: MessageFlags.Ephemeral });
}

module.exports = {
  handleBasketAiStart,
  handleBasketAiModeSelect,
  handleBasketAiCustomModal,
  handleBasketAiReplace,
  handleBasketAiReplaceModal,
  handleBasketAiAppend,
  handleBasketAiAppendModal,
};
