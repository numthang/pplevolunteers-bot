// handlers/quoteHandler.js
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  AttachmentBuilder,
  MessageFlags,
} = require('discord.js');
const path = require('path');
const fs   = require('fs');
const { fetchBuffer, applyQuoteOverlay, applyWatermark } = require('../utils/watermarkImage');
const { analyzeLayout } = require('../services/aiLayout');

const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'watermark');

function getWatermarkDir(guildId) {
  const guildDir = path.join(ASSETS_DIR, guildId);
  return fs.existsSync(guildDir) ? guildDir : ASSETS_DIR;
}

function getDefaultWatermark(guildId) {
  const dir   = getWatermarkDir(guildId);
  const files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f)).sort();
  return files.length ? path.join(dir, files[0]) : null;
}

const SUPPORTED = new Set(['image/png', 'image/jpeg', 'image/webp']);
const pending   = new Map(); // userId → { url, mimeType, filename }

function getFirstImage(msg) {
  return [...msg.attachments.values()].find(a => {
    const mime = a.contentType?.split(';')[0].trim();
    return SUPPORTED.has(mime);
  });
}

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
    url:      att.url,
    mimeType: att.contentType.split(';')[0].trim(),
    filename: att.name,
  });

  const modal = new ModalBuilder()
    .setCustomId('quote_modal')
    .setTitle('💬 Quote Overlay');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('quote_text')
        .setLabel('ข้อความ Quote')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('การเป็นอาสาสมัครคือการให้โดยไม่หวังสิ่งตอบแทน')
        .setValue('ผมยกเลิก LINE Subscription หมดเลยหันมาใช้ Discord')
        .setRequired(true)
        .setMaxLength(300)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('quote_author')
        .setLabel('ชื่อ / @handle')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('นรพนธ์ พลายศรีนิล คณะทำงานพรรคประชาชนราชบุรี เขต 1')
        .setValue('นรพนธ์ พลายศรีนิล คณะทำงานพรรคประชาชนราชบุรี เขต 1')
        .setRequired(true)
        .setMaxLength(60)
    ),
  );

  await interaction.showModal(modal);
}

async function handleQuoteModal(interaction) {
  const state = pending.get(interaction.user.id);
  if (!state) {
    return interaction.reply({
      content: '❌ Session หมดอายุ ลองใหม่อีกครั้ง',
      flags: MessageFlags.Ephemeral,
    });
  }
  pending.delete(interaction.user.id);

  const quoteText  = interaction.fields.getTextInputValue('quote_text');
  const authorName = interaction.fields.getTextInputValue('quote_author');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    await interaction.editReply({ content: '⏳ กำลังโหลดรูป...' });
    const buf = await fetchBuffer(state.url);

    await interaction.editReply({ content: '🤖 AI กำลังวิเคราะห์รูป...' });
    const layout = await analyzeLayout(buf, state.mimeType);
    console.log('[quoteHandler] layout:', JSON.stringify(layout));

    await interaction.editReply({ content: `🎨 กำลัง render... _${layout.reasoning}_` });
    let { buffer: outBuf, ext } = await applyQuoteOverlay(buf, { quoteText, authorName, layout });

    // ติดโลโก้ guild ด้วยเสมอ (ถ้ามี)
    const wmPath = getDefaultWatermark(interaction.guildId);
    if (wmPath) {
      const result = await applyWatermark(outBuf, {
        imagePath: wmPath,
        position:  'bottom-right',
        opacity:   0.8,
        size:      0.13,
      });
      outBuf = result.buffer;
      ext    = result.ext;
    }

    const baseName = state.filename.replace(/\.[^.]+$/, '');
    const file     = new AttachmentBuilder(outBuf, { name: `${baseName}_quote.${ext}` });

    await interaction.channel.send({
      content: `💬 Quote โดย <@${interaction.user.id}>`,
      files:   [file],
    });

    await interaction.editReply({ content: '✅ ส่งแล้ว!' });
  } catch (err) {
    console.error('[quoteHandler]', err);
    await interaction.editReply({ content: `❌ เกิดข้อผิดพลาด: ${err.message}` });
  }
}

module.exports = { handleQuoteCommand, handleQuoteModal };
