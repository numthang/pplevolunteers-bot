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
const { AI_MODES, getMode } = require('../config/aiModes');
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

  const menu = new StringSelectMenuBuilder()
    .setCustomId('basket_ai_mode')
    .setPlaceholder('เลือกรูปแบบที่ต้องการ')
    .addOptions([
      ...AI_MODES.map(m => ({ label: m.label, value: m.value })),
      { label: '✍️ กำหนด prompt เอง', value: CUSTOM_VALUE },
    ]);

  await interaction.reply({
    content: '🤖 จะให้ AI เรียบเรียง caption ในตะกร้าเป็นแบบไหน?',
    components: [new ActionRowBuilder().addComponents(menu)],
    flags: MessageFlags.Ephemeral,
  });
}

// ─── 2. เลือก mode ────────────────────────────────────────────────────────────
async function handleBasketAiModeSelect(interaction) {
  const modeValue = interaction.values[0];

  if (modeValue === CUSTOM_VALUE) {
    const input = new TextInputBuilder()
      .setCustomId('basket_ai_prompt')
      .setLabel('Prompt (แก้ได้ตามใจ)')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(getMode('social_post').prompt)
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

  let result;
  try {
    result = await processText(caption, modeValue, customPrompt);
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

  await interaction.editReply({
    content: `${mode.label}\n${'─'.repeat(20)}\n${body}`,
    components: [new ActionRowBuilder().addComponents(replaceBtn)],
  });
}

// ─── 3. กดแทนที่ → เขียนทับ caption → เปิดตะกร้า ─────────────────────────────
async function handleBasketAiReplace(interaction) {
  const token = interaction.customId.split(':')[1];
  const data  = takeOutput(token);

  if (!data) {
    return interaction.reply({ content: '❌ ผลลัพธ์หมดอายุแล้ว — กด 🤖 ใหม่', flags: MessageFlags.Ephemeral });
  }

  // ตะกร้าสื่อไม่เอา markdown
  const caption = stripDiscordMarkdown(data.caption);
  await setCaption(data.guildId, data.channelId, interaction.user.id, caption, null);
  outputCache.delete(token);

  const basket  = await getBasket(data.guildId, data.channelId);
  const payload = await buildBasketPayload(basket, data.guildId, data.channelId, interaction.user.id);
  await interaction.reply({
    content: '✅ แทนที่ caption แล้ว',
    ...payload,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  handleBasketAiStart,
  handleBasketAiModeSelect,
  handleBasketAiCustomModal,
  handleBasketAiReplace,
};
