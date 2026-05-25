// handlers/quoteHandler.js
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  AttachmentBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const path = require('path');
const fs   = require('fs');
const { fetchBuffer } = require('../utils/watermarkImage');
const { renderQuoteStyle } = require('../utils/quoteStyles');

const SUPPORTED = new Set(['image/png', 'image/jpeg', 'image/webp']);
const pending   = new Map(); // userId → { url, mimeType, filename, style, saturation }

const VALID_STYLES = [
  'quote-1-ember-left',
  'quote-1-ember-right',
  'quote-1-pillar-left',
  'quote-1-frame-right',
];

const STYLE_LABELS = {
  'quote-1-ember-left':  { label: 'ember-left',  description: 'gradient ล่าง · quote ซ้าย' },
  'quote-1-ember-right': { label: 'ember-right', description: 'gradient ล่าง · quote ขวา' },
  'quote-1-pillar-left': { label: 'pillar-left', description: 'frame decoration · quote ซ้าย' },
  'quote-1-frame-right': { label: 'frame-right', description: 'กรอบส้ม · quote ขวา' },
};

function getFirstImage(msg) {
  return [...msg.attachments.values()].find(a => SUPPORTED.has(a.contentType?.split(';')[0].trim()));
}

// ── Step 1: right-click → show dropdowns ─────────────────────────────────────
async function handleQuoteCommand(interaction) {
  const msg = interaction.targetMessage;
  const att = getFirstImage(msg);

  if (!att) {
    return interaction.reply({
      content: '❌ ไม่พบรูปภาพในข้อความนี้ (รองรับ PNG, JPG, WEBP)',
      flags: MessageFlags.Ephemeral,
    });
  }

  pending.set(interaction.user.id, {
    url:        att.url,
    mimeType:   att.contentType.split(';')[0].trim(),
    filename:   att.name,
    style:      null,   // null = สุ่ม
    saturation: 1.0,    // default = สี
  });

  const styleRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('quote_style_select')
      .setPlaceholder('🎨 สไตล์ — ไม่เลือก = สุ่ม')
      .setMinValues(0).setMaxValues(1)
      .addOptions(VALID_STYLES.map(k => ({
        label:       STYLE_LABELS[k].label,
        value:       k,
        description: STYLE_LABELS[k].description,
      })))
  );

  const colorRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('quote_color_select')
      .setPlaceholder('🌈 พื้นหลัง — ไม่เลือก = สี')
      .setMinValues(0).setMaxValues(1)
      .addOptions([
        { label: 'สี',    value: '1.0',  description: 'ภาพสีเต็ม', default: true },
        { label: 'กลาง', value: '0.55', description: 'สีอ่อนลง' },
        { label: 'ขาวดำ', value: '0.15', description: 'ขาวดำ' },
      ])
  );

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`quote_confirm:${Date.now()}`)
      .setLabel('ใส่ข้อความ →')
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({
    content: '💬 **Quote Image** — เลือกสไตล์และพื้นหลัง',
    components: [styleRow, colorRow, confirmRow],
    flags: MessageFlags.Ephemeral,
  });
}

// ── Step 2a: dropdown style ───────────────────────────────────────────────────
async function handleQuoteStyleSelect(interaction) {
  const state = pending.get(interaction.user.id);
  if (state) state.style = interaction.values[0] ?? null;
  await interaction.deferUpdate();
}

// ── Step 2b: dropdown color ───────────────────────────────────────────────────
async function handleQuoteColorSelect(interaction) {
  const state = pending.get(interaction.user.id);
  if (state) state.saturation = parseFloat(interaction.values[0] ?? '1.0');
  await interaction.deferUpdate();
}

// ── Step 3: confirm button → show modal (text + author only) ─────────────────
async function handleQuoteConfirm(interaction) {
  const state = pending.get(interaction.user.id);
  if (!state) {
    return interaction.reply({ content: '❌ Session หมดอายุ ลองใหม่อีกครั้ง', flags: MessageFlags.Ephemeral });
  }

  const modal = new ModalBuilder()
    .setCustomId(`quote_modal:${Date.now()}`)
    .setTitle('💬 Quote Overlay');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('quote_text')
        .setLabel('ข้อความ Quote (กด Enter เพื่อแบ่งบรรทัด)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Discord ดีกว่า Line มาก\nจัดการงานเป็นระเบียบ\nทั้งองค์กรเปลี่ยนมาใช้แล้ว')
        .setRequired(true)
        .setMaxLength(300)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('quote_author')
        .setLabel('ชื่อ / ตำแหน่ง (ไม่เกิน 35 ตัวอักษร)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('ชื่อ คณะทำงานพรรคประชาชนราชบุรี เขต 1')
        .setRequired(true)
        .setMaxLength(35)
    ),
  );

  await interaction.showModal(modal);
}

// ── Step 4: modal submit → render ────────────────────────────────────────────
async function handleQuoteModal(interaction) {
  const state = pending.get(interaction.user.id);
  if (!state) {
    return interaction.reply({ content: '❌ Session หมดอายุ ลองใหม่อีกครั้ง', flags: MessageFlags.Ephemeral });
  }

  const quoteText  = interaction.fields.getTextInputValue('quote_text');
  const authorName = interaction.fields.getTextInputValue('quote_author');
  const styleKey   = state.style ?? VALID_STYLES[Math.floor(Math.random() * VALID_STYLES.length)];
  const saturation = state.saturation ?? 1.0;

  pending.delete(interaction.user.id);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    await interaction.editReply({ content: '⏳ กำลังโหลดรูป...' });
    const buf = await fetchBuffer(state.url);

    await interaction.editReply({ content: `🎨 กำลัง render ${styleKey}...` });
    const { buffer: outBuf, ext } = await renderQuoteStyle(styleKey, buf, { quoteText, authorName, saturation });

    const baseName = state.filename.replace(/\.[^.]+$/, '');
    const file     = new AttachmentBuilder(outBuf, { name: `${baseName}_quote.${ext}` });

    await interaction.channel.send({
      content: `💬 Quote โดย <@${interaction.user.id}>`,
      files:   [file],
    });

    await interaction.editReply({ content: `✅ ส่งแล้ว! (${styleKey})` });
  } catch (err) {
    console.error('[quoteHandler]', err);
    await interaction.editReply({ content: `❌ เกิดข้อผิดพลาด: ${err.message}` });
  }
}

module.exports = { handleQuoteCommand, handleQuoteStyleSelect, handleQuoteColorSelect, handleQuoteConfirm, handleQuoteModal };
