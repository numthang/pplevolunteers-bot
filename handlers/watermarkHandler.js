// handlers/watermarkHandler.js
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  MessageFlags,
} = require('discord.js');
const path = require('path');
const fs = require('fs');
const { fetchBuffer, applyWatermark } = require('../utils/watermarkImage');

const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'watermark');
const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const pending = new Map(); // userId → { type, pos, opacity, messageId }

function getWatermarkFiles() {
  try {
    return fs.readdirSync(ASSETS_DIR).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
  } catch {
    return [];
  }
}

function stripExt(filename) {
  return filename.replace(/\.[^.]+$/, '').replace(/^\d+-/, '');
}

function getImages(msg) {
  return [...msg.attachments.values()].filter(a => {
    if (!a.contentType) return false;
    return SUPPORTED_TYPES.has(a.contentType.split(';')[0].trim());
  });
}

function buildComponents(files) {
  const typeOptions = [
    ...files.map(f =>
      new StringSelectMenuOptionBuilder().setLabel(stripExt(f)).setValue(f)
    ),
    new StringSelectMenuOptionBuilder()
      .setLabel('Custom text...')
      .setValue('custom')
      .setEmoji('✏️'),
  ];

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('wm_type')
        .setPlaceholder('เลือกแบบลายน้ำ')
        .addOptions(typeOptions)
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('wm_pos')
        .setPlaceholder('ตำแหน่ง (default: ล่างขวา)')
        .addOptions([
          new StringSelectMenuOptionBuilder().setLabel('ล่างขวา').setValue('bottom-right').setEmoji('↘️'),
          new StringSelectMenuOptionBuilder().setLabel('ล่างซ้าย').setValue('bottom-left').setEmoji('↙️'),
          new StringSelectMenuOptionBuilder().setLabel('กลาง').setValue('center').setEmoji('⏺️'),
          new StringSelectMenuOptionBuilder().setLabel('บนขวา').setValue('top-right').setEmoji('↗️'),
          new StringSelectMenuOptionBuilder().setLabel('สุ่มตำแหน่ง').setValue('random').setEmoji('🎲'),
        ])
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('wm_opacity')
        .setPlaceholder('ความเข้ม (default: 0.8)')
        .addOptions([
          new StringSelectMenuOptionBuilder().setLabel('0.5 — จาง').setValue('0.5'),
          new StringSelectMenuOptionBuilder().setLabel('0.8 — ปกติ').setValue('0.8'),
          new StringSelectMenuOptionBuilder().setLabel('1.0 — เต็ม').setValue('1.0'),
        ])
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('wm_confirm')
        .setLabel('✅ ติดลายน้ำ')
        .setStyle(ButtonStyle.Primary)
    ),
  ];
}

// ─── Initial trigger (context menu) ───────────────────────────────────────────
async function handleWatermarkCommand(interaction) {
  const msg = interaction.targetMessage;
  const images = getImages(msg);

  if (images.length === 0) {
    return interaction.reply({
      content: '❌ ไม่พบรูปภาพในข้อความนี้ (รองรับ PNG, JPG, WEBP)',
      flags: MessageFlags.Ephemeral,
    });
  }

  const files = getWatermarkFiles();
  if (files.length === 0) {
    return interaction.reply({
      content: '❌ ยังไม่มีไฟล์ลายน้ำใน `assets/watermark/` กรุณาเพิ่มไฟล์ก่อน',
      flags: MessageFlags.Ephemeral,
    });
  }

  pending.set(interaction.user.id, {
    messageId: msg.id,
    type: null,
    pos: 'bottom-right',
    opacity: 0.8,
  });

  await interaction.reply({
    content: `🖼️ พบ **${images.length}** รูป — เลือกแบบแล้วกด ✅`,
    components: buildComponents(files),
    flags: MessageFlags.Ephemeral,
  });
}

// ─── Dropdown selections ───────────────────────────────────────────────────────
async function handleWatermarkSelect(interaction) {
  const state = pending.get(interaction.user.id);
  if (!state) return interaction.deferUpdate();

  const val = interaction.values[0];
  if (interaction.customId === 'wm_type')    state.type    = val;
  if (interaction.customId === 'wm_pos')     state.pos     = val;
  if (interaction.customId === 'wm_opacity') state.opacity = parseFloat(val);

  await interaction.deferUpdate();
}

// ─── Confirm button ────────────────────────────────────────────────────────────
async function handleWatermarkConfirm(interaction) {
  const state = pending.get(interaction.user.id);
  if (!state) {
    return interaction.reply({ content: '❌ Session หมดอายุ กรุณาใช้ใหม่', flags: MessageFlags.Ephemeral });
  }

  if (!state.type) {
    return interaction.reply({ content: '❌ กรุณาเลือกแบบลายน้ำก่อน', flags: MessageFlags.Ephemeral });
  }

  if (state.type === 'custom') {
    // ยังไม่ลบ pending — รอ modal submit
    const modal = new ModalBuilder()
      .setCustomId('wm_custom_text')
      .setTitle('ลายน้ำข้อความ');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('wm_text_input')
          .setLabel('ข้อความลายน้ำ')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('เช่น © PPLE 2025')
          .setRequired(true)
          .setMaxLength(50)
      )
    );
    return interaction.showModal(modal);
  }

  // ลบ synchronously ก่อน await แรก — ป้องกัน double-click
  pending.delete(interaction.user.id);
  await processWatermark(interaction, state, null);
}

// ─── Custom text modal submit ──────────────────────────────────────────────────
async function handleWatermarkModal(interaction) {
  const state = pending.get(interaction.user.id);
  if (!state) {
    return interaction.reply({ content: '❌ Session หมดอายุ กรุณาใช้ใหม่', flags: MessageFlags.Ephemeral });
  }

  // ลบ synchronously ก่อน await แรก — ป้องกัน double-submit
  pending.delete(interaction.user.id);
  const text = interaction.fields.getTextInputValue('wm_text_input');
  await processWatermark(interaction, state, text);
}

// ─── Process ──────────────────────────────────────────────────────────────────
async function processWatermark(interaction, state, customText) {
  if (interaction.isModalSubmit()) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } else {
    await interaction.deferUpdate();
  }

  let msg;
  try {
    msg = await interaction.channel.messages.fetch(state.messageId);
  } catch {
    return interaction.editReply({ content: '❌ ไม่พบข้อความต้นทาง' });
  }

  const images = getImages(msg);
  const total = images.length;
  const imagePath = state.type !== 'custom'
    ? path.join(ASSETS_DIR, state.type)
    : null;

  await interaction.editReply({ content: `⏳ กำลังประมวลผล 0/${total} รูป...`, components: [] });

  const results = []; // { attachment, size }
  const errors = [];
  const MAX_BATCH = 7 * 1024 * 1024; // 7MB ต่อ message

  for (let i = 0; i < images.length; i++) {
    const att = images[i];
    try {
      const srcBuf = await fetchBuffer(att.url);
      const { buffer: outBuf, ext } = await applyWatermark(srcBuf, {
        text: customText || null,
        imagePath,
        position: state.pos,
        opacity: state.opacity,
      });
      const baseName = att.name.replace(/\.[^.]+$/, '');
      results.push({ attachment: new AttachmentBuilder(outBuf, { name: `${baseName}_watermark.${ext}` }), size: outBuf.length });
    } catch (err) {
      errors.push(`❌ ${att.name}: ${err.message}`);
    }
    interaction.editReply({ content: `⏳ กำลังประมวลผล ${i + 1}/${total} รูป...` }).catch(() => {});
  }

  if (results.length === 0) {
    return interaction.editReply({ content: `❌ ประมวลผลไม่สำเร็จ\n${errors.join('\n')}` }).catch(() => {});
  }

  // แบ่ง batch ตามขนาดไฟล์รวม
  const batches = [];
  let batch = [], batchSize = 0;
  for (const r of results) {
    if (batchSize + r.size > MAX_BATCH && batch.length > 0) {
      batches.push(batch);
      batch = [];
      batchSize = 0;
    }
    batch.push(r.attachment);
    batchSize += r.size;
  }
  if (batch.length > 0) batches.push(batch);

  for (let i = 0; i < batches.length; i++) {
    const payload = { files: batches[i] };
    if (i === 0) payload.content = `💧 ติดลายน้ำโดย <@${interaction.user.id}>`;
    if (i === 0) await msg.reply(payload);
    else await msg.channel.send(payload);
  }

  interaction.editReply({
    content: `✅ ส่งแล้ว ${results.length} รูป` + (errors.length ? '\n' + errors.join('\n') : ''),
  }).catch(() => {});
}

module.exports = {
  handleWatermarkCommand,
  handleWatermarkSelect,
  handleWatermarkConfirm,
  handleWatermarkModal,
};
