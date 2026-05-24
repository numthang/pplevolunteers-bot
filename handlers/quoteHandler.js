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
const { fetchBuffer, applyWatermark } = require('../utils/watermarkImage');
const { analyzeLayout }               = require('../services/aiLayout');
const { renderQuoteStyle }            = require('../utils/quoteStyles');

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

function parseStyle(raw) {
  const s = (raw || '').trim().toLowerCase();
  if (!s || s === 'สุ่ม' || s === 'สุ่ม') return Math.floor(Math.random() * 6) + 1;
  const n = parseInt(s, 10);
  if (n >= 1 && n <= 6) return n;
  return null; // invalid
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
    .setCustomId(`quote_modal:${Date.now()}`)
    .setTitle('💬 Quote Overlay');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('quote_text')
        .setLabel('ข้อความ Quote')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('การเป็นอาสาสมัครคือการให้โดยไม่หวังสิ่งตอบแทน')
        .setRequired(true)
        .setMaxLength(300)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('quote_author')
        .setLabel('ชื่อ / ตำแหน่ง')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('ชื่อ คณะทำงานพรรคประชาชนราชบุรี เขต 1')
        .setRequired(true)
        .setMaxLength(80)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('quote_style')
        .setLabel('สไตล์ (1-6 หรือ สุ่ม)')
        .setStyle(TextInputStyle.Short)
        .setValue('สุ่ม')
        .setRequired(false)
        .setMaxLength(4)
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

  const quoteText  = interaction.fields.getTextInputValue('quote_text');
  const authorName = interaction.fields.getTextInputValue('quote_author');
  const styleRaw   = interaction.fields.getTextInputValue('quote_style');
  const styleNum   = parseStyle(styleRaw);

  if (styleNum === null) {
    return interaction.reply({
      content: '❌ สไตล์ไม่ถูกต้อง — พิมพ์ตัวเลข 1-6 หรือ "สุ่ม"',
      flags: MessageFlags.Ephemeral,
    });
  }

  pending.delete(interaction.user.id);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    await interaction.editReply({ content: '⏳ กำลังโหลดรูป...' });
    const buf = await fetchBuffer(state.url);

    // วิเคราะห์ layout เฉพาะ style 3 (Editorial Focus — dynamic placement)
    let layout = {};
    if (styleNum === 3) {
      await interaction.editReply({ content: '🤖 AI กำลังวิเคราะห์รูป...' });
      layout = await analyzeLayout(buf, state.mimeType);
      console.log('[quoteHandler] layout:', JSON.stringify(layout));
    }

    await interaction.editReply({ content: `🎨 กำลัง render สไตล์ ${styleNum}...` });
    let { buffer: outBuf, ext } = await renderQuoteStyle(styleNum, buf, { quoteText, authorName, layout });

    // ติดโลโก้ guild
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

    await interaction.editReply({ content: `✅ ส่งแล้ว! (สไตล์ ${styleNum})` });
  } catch (err) {
    console.error('[quoteHandler]', err);
    await interaction.editReply({ content: `❌ เกิดข้อผิดพลาด: ${err.message}` });
  }
}

module.exports = { handleQuoteCommand, handleQuoteModal };
