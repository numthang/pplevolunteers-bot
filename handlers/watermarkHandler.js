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
const { fetchBuffer, applyWatermark, autoEnhance } = require('../utils/watermarkImage');

const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'watermark');
const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const pending = new Map(); // userId → { type, pos, opacity, messageId }

function getWatermarkDir(guildId) {
  const guildDir = path.join(ASSETS_DIR, guildId);
  return fs.existsSync(guildDir) ? guildDir : ASSETS_DIR;
}

function getPersonalDir(userId) {
  return path.join(ASSETS_DIR, `user_${userId}`);
}

function getWatermarkFiles(guildId) {
  try {
    return fs.readdirSync(getWatermarkDir(guildId)).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
  } catch {
    return [];
  }
}

function getPersonalFiles(userId) {
  try {
    return fs.readdirSync(getPersonalDir(userId)).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
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

function buildComponents(personalFiles, guildFiles, enhance = false) {
  const typeOptions = [
    ...personalFiles.map(f =>
      new StringSelectMenuOptionBuilder()
        .setLabel(stripExt(f))
        .setValue(`personal:${f}`)
        .setEmoji('🔒')
    ),
    ...guildFiles.map(f =>
      new StringSelectMenuOptionBuilder().setLabel(stripExt(f)).setValue(`guild:${f}`)
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
      new StringSelectMenuBuilder()
        .setCustomId('wm_size')
        .setPlaceholder('ขนาดลายน้ำ (default: 13%)')
        .addOptions([
          new StringSelectMenuOptionBuilder().setLabel('8%  — เล็ก').setValue('0.08'),
          new StringSelectMenuOptionBuilder().setLabel('10% — เล็กกลาง').setValue('0.10'),
          new StringSelectMenuOptionBuilder().setLabel('13% — ปกติ').setValue('0.13'),
          new StringSelectMenuOptionBuilder().setLabel('15% — ใหญ่กลาง').setValue('0.15'),
          new StringSelectMenuOptionBuilder().setLabel('20% — ใหญ่').setValue('0.20'),
        ])
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('wm_enhance')
        .setLabel(enhance ? '✨ Enhance: เปิด' : '✨ Enhance: ปิด')
        .setStyle(enhance ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('wm_confirm')
        .setLabel('✅ ติดลายน้ำ')
        .setStyle(ButtonStyle.Primary),
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

  const { guildId } = interaction;
  const userId = interaction.user.id;
  const personalFiles = getPersonalFiles(userId);
  const guildFiles = getWatermarkFiles(guildId);

  if (personalFiles.length === 0 && guildFiles.length === 0) {
    return interaction.reply({
      content: '❌ ยังไม่มีไฟล์ลายน้ำ กรุณาเพิ่มไฟล์ใน `assets/watermark/` ก่อน',
      flags: MessageFlags.Ephemeral,
    });
  }

  pending.set(userId, {
    messageId: msg.id,
    guildId,
    userId,
    type: null,
    pos: 'bottom-right',
    opacity: 0.8,
    size: 0.13,
    enhance: false,
  });

  await interaction.reply({
    content: `🖼️ พบ **${images.length}** รูป — เลือกแบบแล้วกด ✅`,
    components: buildComponents(personalFiles, guildFiles, false),
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
  if (interaction.customId === 'wm_size')    state.size    = parseFloat(val);

  await interaction.deferUpdate();
}

// ─── Enhance toggle button ────────────────────────────────────────────────────
async function handleWatermarkEnhance(interaction) {
  const state = pending.get(interaction.user.id);
  if (!state) return interaction.deferUpdate();
  state.enhance = !state.enhance;
  const personalFiles = getPersonalFiles(state.userId);
  const guildFiles = getWatermarkFiles(state.guildId);
  await interaction.update({ components: buildComponents(personalFiles, guildFiles, state.enhance) });
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
  let imagePath = null;
  if (state.type && state.type !== 'custom') {
    if (state.type.startsWith('personal:')) {
      imagePath = path.join(getPersonalDir(state.userId), state.type.slice('personal:'.length));
    } else {
      const filename = state.type.startsWith('guild:') ? state.type.slice('guild:'.length) : state.type;
      imagePath = path.join(getWatermarkDir(state.guildId), filename);
    }
  }

  await interaction.editReply({ content: `⏳ กำลังประมวลผล 0/${total} รูป...`, components: [] });

  const results = []; // { attachment, size }
  const errors = [];
  const MAX_BATCH = 7 * 1024 * 1024; // 7MB ต่อ message

  for (let i = 0; i < images.length; i++) {
    const att = images[i];
    try {
      let srcBuf = await fetchBuffer(att.url);
      if (state.enhance) srcBuf = await autoEnhance(srcBuf);
      const { buffer: outBuf, ext } = await applyWatermark(srcBuf, {
        text: customText || null,
        imagePath,
        position: state.pos,
        opacity: state.opacity,
        size: state.size,
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
  handleWatermarkEnhance,
  handleWatermarkConfirm,
  handleWatermarkModal,
};
