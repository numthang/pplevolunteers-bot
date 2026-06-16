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
const path  = require('path');
const fs    = require('fs');
const sharp = require('sharp');
const { fetchBuffer, applyWatermark } = require('../utils/watermarkImage');
const { renderQuoteStyle } = require('../utils/quoteStyles');
const { QUOTE_STYLE_OPTIONS, QUOTE_STYLE_KEYS, QUOTE_AI_KEY } = require('../utils/quoteStyleKeys');
const { resolveConfig } = require('../db/configResolver');
const { getUserSetting, setUserSetting } = require('../db/userConfig');

const QUOTE_STATE_KEY = 'quote_state';
async function getQuoteState(userId) {
  const v = await getUserSetting(userId, QUOTE_STATE_KEY);
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}
async function setQuoteStatePartial(userId, patch) {
  const cur = (await getQuoteState(userId)) || {};
  await setUserSetting(userId, QUOTE_STATE_KEY, { ...cur, ...patch });
}

const QUOTE_KEY_TEMPLATE  = 'quote_default_template'; // template = เฉพาะ quote
const KEY_WATERMARK       = 'quote_default_watermark'; // watermark default เฉพาะ quote (basket ใช้ default_watermark แยก)

// crop เป็น 1:1 ตายตัว — เลือกตำแหน่ง: auto (attention หาโซนคน) / แนวนอน left-center-right / แนวตั้ง top-bottom
const CROP_POS = {
  auto: sharp.strategy.attention,
  left: 'left', center: 'center', right: 'right',
  top: 'top', bottom: 'bottom',
};
async function cropSquare(buf, pos) {
  if (pos === 'none') return buf;   // ไม่ครอป — ส่งภาพต้นฉบับผ่านไปเลย
  return sharp(buf).resize(1080, 1080, { fit: 'cover', position: CROP_POS[pos] ?? sharp.strategy.attention }).toBuffer();
}

const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'watermark');
const SUPPORTED  = new Set(['image/png', 'image/jpeg', 'image/webp']);
const pending    = new Map(); // userId → { url, mimeType, filename, style, saturation, crop, watermark }

// AI = ค่า default ทุก dropdown (ไม่เลือก = AI/1:1) — เลือกเองได้ทับ AI
// รายชื่อ styles มาจาก utils/quoteStyleKeys.js (zero-dep, web ใช้ร่วมได้)
const STYLE_OPTIONS = QUOTE_STYLE_OPTIONS;


// ── Watermark helpers (server + personal รวมกัน) ─────────────────────────────
function getWatermarkDir(guildId) {
  const guildDir = path.join(ASSETS_DIR, guildId);
  return fs.existsSync(guildDir) ? guildDir : ASSETS_DIR;
}
function getPersonalDir(userId) {
  return path.join(ASSETS_DIR, `user_${userId}`);
}
const IMG_RE = /\.(png|jpg|jpeg|webp)$/i;
// คืน relative path ของไฟล์ภาพ — ไฟล์ชั้นบนสุด + ลง subfolder 1 ชั้น (เช่น "กลุ่ม/1. logo.png")
function listFilesRec(dir) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isFile() && IMG_RE.test(e.name)) out.push(e.name);
    else if (e.isDirectory()) {
      for (const f of (fs.readdirSync(path.join(dir, e.name)).filter(x => IMG_RE.test(x))))
        out.push(path.join(e.name, f));
    }
  }
  return out;
}
function stripExt(f) {
  return path.basename(f).replace(/\.[^.]+$/, '').replace(/^\d+\.?\s*/, '');
}
// คืน [{ value:'personal:rel'|'guild:rel', label, emoji }] — รวม subfolder
function getWatermarkChoices(guildId, userId) {
  const personal = listFilesRec(getPersonalDir(userId)).map(f => ({ value: `personal:${f}`, label: stripExt(f), emoji: '🔒' }));
  const guild    = listFilesRec(getWatermarkDir(guildId)).map(f => ({ value: `guild:${f}`,    label: stripExt(f) }));
  return [...personal, ...guild].slice(0, 24); // Discord select cap 25 (เผื่อ "ไม่ใส่")
}
function resolveWatermarkPath(watermark, guildId, userId) {
  if (!watermark) return null;
  const [scope, file] = [watermark.slice(0, watermark.indexOf(':')), watermark.slice(watermark.indexOf(':') + 1)];
  const dir = scope === 'personal' ? getPersonalDir(userId) : getWatermarkDir(guildId);
  const full = path.join(dir, file);
  return fs.existsSync(full) ? full : null;
}

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

  const wmChoices = getWatermarkChoices(interaction.guildId, interaction.user.id);

  // โหลด saved state ก่อน แล้วค่อย fallback config > hard default
  const saved = await getQuoteState(interaction.user.id).catch(() => null);

  let defaultStyle = saved?.style ?? null;
  if (defaultStyle === null) {
    try {
      const { value } = await resolveConfig(interaction.user.id, interaction.guildId, QUOTE_KEY_TEMPLATE);
      if (value && QUOTE_STYLE_KEYS.includes(value)) defaultStyle = value;
    } catch (err) { console.error('[quoteHandler] resolve template default:', err.message); }
  }

  let defaultWatermark = saved?.watermark ?? null;
  if (defaultWatermark === null) {
    try {
      const { value } = await resolveConfig(interaction.user.id, interaction.guildId, KEY_WATERMARK);
      if (value && resolveWatermarkPath(value, interaction.guildId, interaction.user.id)) defaultWatermark = value;
    } catch (err) { console.error('[quoteHandler] resolve watermark default:', err.message); }
  }

  const defaultSaturation = saved?.saturation ?? null;
  const defaultCrop       = saved?.crop ?? 'auto';

  pending.set(interaction.user.id, {
    url:        att.url,
    mimeType:   att.contentType.split(';')[0].trim(),
    filename:   att.name,
    style:      defaultStyle,
    saturation: defaultSaturation != null ? parseFloat(defaultSaturation) : null,
    crop:       defaultCrop,
    watermark:  (defaultWatermark === 'none' || defaultWatermark === null) ? null : defaultWatermark,
  });

  const COLOR_OPTIONS = [
    { label: 'สี',    value: '1.0',  description: 'ภาพสีเต็ม' },
    { label: 'กลาง', value: '0.55', description: 'สีอ่อนลง' },
    { label: 'ขาวดำ', value: '0.15', description: 'ขาวดำ' },
  ];
  const CROP_OPTIONS = [
    { label: 'อัตโนมัติ', value: 'auto',   description: 'หาโซนคนให้เอง' },
    { label: 'ไม่ครอป',   value: 'none',   description: 'ใช้สัดส่วนเดิม ไม่ตัด' },
    { label: 'ซ้าย',     value: 'left',   description: 'เก็บฝั่งซ้าย (แนวนอน)' },
    { label: 'กลาง',     value: 'center', description: 'เก็บตรงกลาง' },
    { label: 'ขวา',      value: 'right',  description: 'เก็บฝั่งขวา (แนวนอน)' },
    { label: 'บน',       value: 'top',    description: 'เก็บด้านบน (แนวตั้ง)' },
    { label: 'ล่าง',     value: 'bottom', description: 'เก็บด้านล่าง (แนวตั้ง)' },
  ];
  const satStr = defaultSaturation != null ? String(defaultSaturation) : null;

  const styleRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('quote_style_select')
      .setPlaceholder('🎨 สไตล์ — ไม่เลือก = ✨ AI จัดตำแหน่ง')
      .setMinValues(0).setMaxValues(1)
      .addOptions(STYLE_OPTIONS.map(o => ({ ...o, default: o.value === defaultStyle })))
  );
  const colorRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('quote_color_select')
      .setPlaceholder('🌈 สี — ไม่เลือก = ✨ AI ตัดสิน')
      .setMinValues(0).setMaxValues(1)
      .addOptions(COLOR_OPTIONS.map(o => ({ ...o, default: o.value === satStr })))
  );
  const cropRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('quote_crop_select')
      .setPlaceholder('🖼️ ครอป 1:1 — ไม่เลือก = auto')
      .setMinValues(0).setMaxValues(1)
      .addOptions(CROP_OPTIONS.map(o => ({ ...o, default: o.value === defaultCrop })))
  );

  const components = [styleRow, colorRow, cropRow];

  // watermark dropdown — แสดงเฉพาะเมื่อมีไฟล์ (personal + guild)
  if (wmChoices.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('quote_wm_select')
        .setPlaceholder('💧 ลายน้ำ — ไม่เลือก = ไม่ใส่')
        .setMinValues(0).setMaxValues(1)
        .addOptions([
          { label: 'ไม่ใส่ลายน้ำ', value: 'none', emoji: { name: '🚫' }, default: defaultWatermark === null || defaultWatermark === 'none' },
          ...wmChoices.map(c => ({ label: c.label, value: c.value, ...(c.emoji ? { emoji: { name: c.emoji } } : {}), default: c.value === defaultWatermark })),
        ])
    ));
  }

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`quote_confirm:${Date.now()}`)
        .setLabel('ใส่ข้อความ →')
        .setStyle(ButtonStyle.Primary)
    )
  );

  await interaction.reply({
    content: '💬 **Quote Image** — ไม่เลือกอะไร = ✨ AI จัดให้ทั้งหมด',
    components,
    flags: MessageFlags.Ephemeral,
  });
}

// ack แบบกัน crash — interaction หมดอายุ/ack ซ้ำ (10062) จะไม่ล้ม bot
async function safeDeferUpdate(interaction) {
  try {
    await interaction.deferUpdate();
  } catch (err) {
    if (err?.code !== 10062) console.error('[quoteHandler] deferUpdate:', err.message);
  }
}

// ── dropdowns (ไม่เลือก = null = AI/default) ─────────────────────────────────
async function handleQuoteStyleSelect(interaction) {
  const state = pending.get(interaction.user.id);
  const v = interaction.values[0] ?? null;
  if (state) state.style = v;
  setQuoteStatePartial(interaction.user.id, { style: v }).catch(console.error);
  await safeDeferUpdate(interaction);
}
async function handleQuoteColorSelect(interaction) {
  const state = pending.get(interaction.user.id);
  const v = interaction.values[0] ?? null; // เก็บเป็น string '1.0'/'0.55'/'0.15' เพื่อเทียบ dropdown
  if (state) state.saturation = v != null ? parseFloat(v) : null;
  setQuoteStatePartial(interaction.user.id, { saturation: v }).catch(console.error);
  await safeDeferUpdate(interaction);
}
async function handleQuoteCropSelect(interaction) {
  const state = pending.get(interaction.user.id);
  const v = interaction.values[0] ?? 'auto';
  if (state) state.crop = v;
  setQuoteStatePartial(interaction.user.id, { crop: v }).catch(console.error);
  await safeDeferUpdate(interaction);
}
async function handleQuoteWatermarkSelect(interaction) {
  const state = pending.get(interaction.user.id);
  const v = interaction.values[0] ?? null;
  if (state) state.watermark = v === 'none' ? null : v;
  // บันทึก 'none' แทน null เพื่อแยกว่า "ตั้งใจไม่ใส่" vs "ยังไม่ตั้ง"
  setQuoteStatePartial(interaction.user.id, { watermark: v ?? 'none' }).catch(console.error);
  await safeDeferUpdate(interaction);
}

// ── Step 3: confirm button → show modal (text + author only) ─────────────────
async function handleQuoteConfirm(interaction) {
  const state = pending.get(interaction.user.id);
  if (!state) {
    return interaction.reply({ content: '❌ Session หมดอายุ ลองใหม่อีกครั้ง', flags: MessageFlags.Ephemeral });
  }

  const saved = await getQuoteState(interaction.user.id).catch(() => null);

  const modal = new ModalBuilder()
    .setCustomId(`quote_modal:${Date.now()}`)
    .setTitle('💬 Quote Overlay');

  const textInput = new TextInputBuilder()
    .setCustomId('quote_text')
    .setLabel('ข้อความ Quote (กด Enter เพื่อแบ่งบรรทัด)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Discord ดีกว่า Line มาก\nจัดการงานเป็นระเบียบ\nทั้งองค์กรเปลี่ยนมาใช้แล้ว')
    .setRequired(true)
    .setMaxLength(300);
  if (saved?.quote_text) textInput.setValue(saved.quote_text);

  const authorInput = new TextInputBuilder()
    .setCustomId('quote_author')
    .setLabel('ชื่อ / ตำแหน่ง (ไม่เกิน 35 ตัวอักษร)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('ชื่อ คณะทำงานพรรคประชาชนราชบุรี เขต 1')
    .setRequired(true)
    .setMaxLength(35);
  if (saved?.quote_author) authorInput.setValue(saved.quote_author);

  modal.addComponents(
    new ActionRowBuilder().addComponents(textInput),
    new ActionRowBuilder().addComponents(authorInput),
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
  setQuoteStatePartial(interaction.user.id, { quote_text: quoteText, quote_author: authorName }).catch(console.error);

  // ไม่เลือกสไตล์ → default template ที่ตั้งไว้ (personal > guild > global) → ไม่มี = AI (ember-ai)
  let defaultStyle = QUOTE_AI_KEY;
  if (!state.style) {
    try {
      const { value } = await resolveConfig(interaction.user.id, interaction.guildId, QUOTE_KEY_TEMPLATE);
      if (value && QUOTE_STYLE_KEYS.includes(value)) defaultStyle = value;
    } catch (err) {
      console.error('[quoteHandler] resolve template default:', err.message);
    }
  }
  // สี: ember-ai ปล่อย null ให้ AI ตัดสิน, manual → null = สี
  const styleKey   = state.style ?? defaultStyle;
  const isAI       = styleKey === QUOTE_AI_KEY;
  const saturation = isAI ? state.saturation : (state.saturation ?? 1.0);

  pending.delete(interaction.user.id);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    await interaction.editReply({ content: '⏳ กำลังโหลดรูป...' });
    const raw = await fetchBuffer(state.url);
    const buf = await cropSquare(raw, state.crop ?? 'auto'); // 1:1, auto=attention เก็บคน

    await interaction.editReply({ content: isAI ? '✨ AI กำลังจัดตำแหน่งและสี...' : `🎨 กำลัง render...` });
    let { buffer: outBuf, ext, vertical, side } = await renderQuoteStyle(styleKey, buf, {
      quoteText, authorName, saturation, mimeType: state.mimeType,
    });

    // ลายน้ำ: center → สุ่ม, อื่นๆ → ฝั่งเดียวกับ quote แนวนอน คนละแถบแนวตั้ง (บนซ้าย→ล่างซ้าย)
    const wmPath = resolveWatermarkPath(state.watermark, interaction.guildId, interaction.user.id);
    if (wmPath) {
      const wmPos  = vertical === 'center'
        ? 'random'
        : `${vertical === 'top' ? 'bottom' : 'top'}-${side === 'right' ? 'right' : 'left'}`;
      const result = await applyWatermark(outBuf, { imagePath: wmPath, position: wmPos, opacity: 0.9, size: 0.13 });
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

module.exports = {
  handleQuoteCommand,
  handleQuoteStyleSelect,
  handleQuoteColorSelect,
  handleQuoteCropSelect,
  handleQuoteWatermarkSelect,
  handleQuoteConfirm,
  handleQuoteModal,
};
