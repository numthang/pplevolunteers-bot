const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { addImages, setCaption, getBasket, clearBasket, addHistory, getHistory } = require('../db/mediaBasket');
const { fetchBuffer, applyWatermark } = require('../utils/watermarkImage');
const { postToFacebook, postToInstagram, getConfig } = require('../services/metaApi');
const { getSetting, setSetting, deleteSetting } = require('../db/settings');

const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'watermark');
const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const pendingPost = new Map(); // userId → { guildId, channelId, wmType, platform, caption?, scheduleTime? }

function getWatermarkFiles() {
  try {
    return fs.readdirSync(ASSETS_DIR).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
  } catch { return []; }
}

function stripExt(f) {
  return f.replace(/\.[^.]+$/, '').replace(/^\d+-/, '');
}

function buildBasketEmbed(imgCount, caption, previewUrl = null) {
  const embed = new EmbedBuilder()
    .setColor(0xff6a13)
    .setTitle(`🧺 ตะกร้าสื่อ — ${imgCount} รูป`);
  if (caption) embed.setDescription(caption);
  else embed.setDescription('*ยังไม่มี caption*');
  if (previewUrl) embed.setImage(previewUrl);
  return embed;
}

function buildBasketButtons(imgCount, hasCaption = false) {
  const empty = imgCount === 0 && !hasCaption;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('basket_post')
      .setLabel('📋 สร้างโพสต์')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(empty),
    new ButtonBuilder()
      .setCustomId('basket_clear')
      .setLabel('🗑️ ล้าง')
      .setStyle(ButtonStyle.Danger),
  );
}

function buildPlatformRow(cfg, defaultPlatform) {
  const platformOptions = [
    new StringSelectMenuOptionBuilder()
      .setLabel('FB + IG').setValue('both').setEmoji('📲')
      .setDefault(defaultPlatform === 'both'),
    new StringSelectMenuOptionBuilder()
      .setLabel('Facebook เท่านั้น').setValue('fb').setEmoji('📘')
      .setDefault(defaultPlatform === 'fb'),
  ];
  if (cfg?.igId) {
    platformOptions.push(
      new StringSelectMenuOptionBuilder().setLabel('Instagram เท่านั้น').setValue('ig').setEmoji('📷')
    );
  }
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('basket_platform')
      .setPlaceholder('โพสต์ที่ไหน')
      .addOptions(platformOptions)
  );
}

// ─── shared: build full basket reply payload ──────────────────────────────────
async function buildBasketPayload(basket, guildId, channelId, userId) {
  const images  = basket.filter(r => r.type === 'image');
  const caption = basket.find(r => r.type === 'caption')?.caption || null;
  const imgCount = images.length;

  const msgIds = [...new Set(images.map(r => r.message_id).filter(Boolean))];
  const links  = msgIds.map((id, i) =>
    `[ดูรูปชุดที่ ${i + 1}](https://discord.com/channels/${guildId}/${channelId}/${id})`
  );
  const previewUrl = images.length
    ? images[Math.floor(Math.random() * images.length)].image_url
    : null;

  const embed = buildBasketEmbed(imgCount, caption, previewUrl);
  if (links.length) embed.addFields({ name: '🖼️ ต้นทาง', value: links.join('\n'), inline: false });

  const cfg = await getConfig(guildId);
  const defaultPlatform = (imgCount > 0 && cfg?.igId) ? 'both' : 'fb';

  const history = await getHistory(guildId, channelId);
  if (history.length) {
    const platformIcon = { fb: '📘', ig: '📷', both: '📲' };
    const lines = history.map(h => {
      const icon  = platformIcon[h.platform] || '📤';
      const date  = new Date((h.schedule_time ? h.schedule_time * 1000 : h.created_at));
      const thaiDate = new Date(date.getTime() + 7 * 60 * 60 * 1000);
      const d = `${String(thaiDate.getUTCDate()).padStart(2,'0')}/${String(thaiDate.getUTCMonth()+1).padStart(2,'0')} ${String(thaiDate.getUTCHours()).padStart(2,'0')}:${String(thaiDate.getUTCMinutes()).padStart(2,'0')}`;
      const imgs  = h.image_count > 0 ? ` · ${h.image_count} รูป` : '';
      const link  = h.fb_url ? ` · [ดูโพสต์](${h.fb_url})` : '';
      const fail  = h.status !== 'success' ? ' ⚠️' : '';
      return `${icon} ${d}${imgs}${link}${fail}`;
    });
    embed.addFields({ name: '📋 ประวัติการโพสต์', value: lines.join('\n'), inline: false });
  }

  pendingPost.set(userId, {
    guildId, channelId,
    wmType: 'none',
    platform: defaultPlatform,
    caption: caption || '',
  });

  const components = [];
  if (imgCount > 0) {
    const files = getWatermarkFiles();
    if (files.length) {
      components.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('basket_wm_type')
          .setPlaceholder('ลายน้ำ (default: ไม่มี)')
          .addOptions([
            new StringSelectMenuOptionBuilder().setLabel('ไม่มีลายน้ำ').setValue('none').setDefault(true),
            ...files.map(f => new StringSelectMenuOptionBuilder().setLabel(stripExt(f)).setValue(f)),
          ])
      ));
    }
  }
  components.push(buildPlatformRow(cfg, defaultPlatform));
  components.push(buildBasketButtons(imgCount, !!caption));

  return { embeds: [embed], components };
}

// ─── Add to basket ────────────────────────────────────────────────────────────
async function handleBasketAdd(interaction) {
  const msg = interaction.targetMessage;
  const images = [...msg.attachments.values()].filter(a => {
    const ct = a.contentType?.split(';')[0].trim();
    return SUPPORTED_TYPES.has(ct);
  });
  const text = msg.content?.trim();

  if (!images.length && !text) {
    return interaction.reply({ content: '❌ ข้อความนี้ไม่มีรูปหรือข้อความ', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { guildId, channelId } = interaction;
  const addedBy = interaction.user.id;
  const isBot = msg.author?.bot ?? false;

  if (images.length) await addImages(guildId, channelId, addedBy, images.map(a => ({ url: a.url })), msg.id);
  if (text && !isBot) await setCaption(guildId, channelId, addedBy, text, msg.id);

  const basket = await getBasket(guildId, channelId);
  const added = [
    images.length ? `🖼️ ${images.length} รูป` : null,
    text && !isBot ? `📝 caption (แทนอันเก่า)` : null,
  ].filter(Boolean).join(' + ');

  const payload = await buildBasketPayload(basket, guildId, channelId, interaction.user.id);
  await interaction.editReply({ content: `✅ เพิ่ม ${added} แล้ว`, ...payload });
}

// ─── View basket ──────────────────────────────────────────────────────────────
async function handleBasketView(interaction) {
  const { guildId, channelId } = interaction;
  const basket = await getBasket(guildId, channelId);

  if (!basket.length) {
    return interaction.reply({ content: '🧺 ตะกร้าสื่อว่างเปล่า', flags: MessageFlags.Ephemeral });
  }

  const payload = await buildBasketPayload(basket, guildId, channelId, interaction.user.id);
  await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

// ─── Clear basket ─────────────────────────────────────────────────────────────
async function handleBasketClear(interaction) {
  await clearBasket(interaction.guildId, interaction.channelId);
  await interaction.reply({ content: '🗑️ ล้างตะกร้าสื่อแล้ว', flags: MessageFlags.Ephemeral });
}

// ─── สร้างโพสต์: open modal ───────────────────────────────────────────────────
function handleBasketPost(interaction) {
  const state = pendingPost.get(interaction.user.id);
  if (!state) return interaction.reply({ content: '❌ Session หมดอายุ กรุณาดูตะกร้าใหม่', flags: MessageFlags.Ephemeral });
  return openScheduleModal(interaction, state.caption || '');
}

// ─── Retry button (after date parse error) ────────────────────────────────────
async function handleBasketRetry(interaction) {
  const state = pendingPost.get(interaction.user.id);
  if (!state) return interaction.reply({ content: '❌ Session หมดอายุ', flags: MessageFlags.Ephemeral });
  return openScheduleModal(interaction, state.caption || '');
}

// ─── Select menus ─────────────────────────────────────────────────────────────
async function handleBasketSelect(interaction) {
  try {
    const state = pendingPost.get(interaction.user.id);
    if (interaction.customId === 'basket_wm_type' && state) state.wmType   = interaction.values[0];
    if (interaction.customId === 'basket_platform' && state) state.platform = interaction.values[0];
    await interaction.deferUpdate();
  } catch (err) {
    console.error('[basketSelect]', err);
  }
}

// ─── Schedule modal ───────────────────────────────────────────────────────────
function defaultScheduleTime() {
  const thaiNow  = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const tomorrow = new Date(thaiNow);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const d = String(tomorrow.getUTCDate()).padStart(2, '0');
  const m = String(tomorrow.getUTCMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${tomorrow.getUTCFullYear()} 17:00`;
}

function openScheduleModal(interaction, existingCaption) {
  // unique customId to bypass Discord client modal cache (forces fresh render)
  const cid = `basket_schedule_modal:${Date.now()}`;
  const modal = new ModalBuilder().setCustomId(cid).setTitle('สร้างโพสต์');

  const captionInput = new TextInputBuilder()
    .setCustomId('basket_caption')
    .setLabel('Caption (เว้นว่างได้)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(2200);

  // setValue only if non-empty (some Discord.js versions silently drop empty value)
  if (existingCaption && existingCaption.length > 0) {
    captionInput.setValue(existingCaption.slice(0, 2200));
  }

  const timeInput = new TextInputBuilder()
    .setCustomId('basket_schedule_time')
    .setLabel('วันเวลาโพสต์ (เว้นว่าง = โพสต์เดี๋ยวนี้)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(20)
    .setValue(defaultScheduleTime());

  modal.addComponents(
    new ActionRowBuilder().addComponents(captionInput),
    new ActionRowBuilder().addComponents(timeInput),
  );
  return interaction.showModal(modal);
}

// ─── Parse Thai date (forgiving) ──────────────────────────────────────────────
function parseThaiDateTime(input) {
  const s = input.trim();
  const thaiNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  let d, mo, y, h, mi;

  // dd/mm/yyyy HH:MM
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (m) { [, d, mo, y, h, mi] = m.map(Number); return new Date(Date.UTC(y, mo - 1, d, h - 7, mi)); }

  // dd/mm HH:MM (ปีปัจจุบัน)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (m) { [, d, mo, h, mi] = m.map(Number); return new Date(Date.UTC(thaiNow.getUTCFullYear(), mo - 1, d, h - 7, mi)); }

  // dd HH:MM (เดือนปัจจุบัน)
  m = s.match(/^(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (m) { [, d, h, mi] = m.map(Number); return new Date(Date.UTC(thaiNow.getUTCFullYear(), thaiNow.getUTCMonth(), d, h - 7, mi)); }

  // HH:MM (พรุ่งนี้ถ้าผ่านไปแล้ว)
  m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    [, h, mi] = m.map(Number);
    const candidate = new Date(Date.UTC(thaiNow.getUTCFullYear(), thaiNow.getUTCMonth(), thaiNow.getUTCDate(), h - 7, mi));
    if (candidate.getTime() < Date.now() + 20 * 60 * 1000) candidate.setUTCDate(candidate.getUTCDate() + 1);
    return candidate;
  }

  return null;
}

const retryRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('basket_retry').setLabel('✏️ แก้ไขใหม่').setStyle(ButtonStyle.Primary)
);

// ─── Modal submit ─────────────────────────────────────────────────────────────
async function handleBasketModal(interaction) {
  const captionInput = interaction.fields.getTextInputValue('basket_caption').trim();
  const timeStr      = interaction.fields.getTextInputValue('basket_schedule_time').trim();
  const state        = pendingPost.get(interaction.user.id);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!state) return interaction.editReply({ content: '❌ Session หมดอายุ' });

  const caption = captionInput || state.caption || '';
  let scheduleTime = null;

  if (timeStr) {
    const scheduleDate = parseThaiDateTime(timeStr);
    if (!scheduleDate || isNaN(scheduleDate.getTime())) {
      state.caption = caption;
      return interaction.editReply({
        content: '❌ รูปแบบวันที่ไม่ถูกต้อง\nรองรับ: `16/05/2026 15:00` · `16/05 15:00` · `16 15:00` · `15:00`',
        components: [retryRow],
      });
    }
    if (scheduleDate.getTime() < Date.now() + 20 * 60 * 1000) {
      state.caption = caption;
      return interaction.editReply({
        content: '❌ ต้องตั้งเวลาล่วงหน้าอย่างน้อย 20 นาที',
        components: [retryRow],
      });
    }
    scheduleTime = Math.floor(scheduleDate.getTime() / 1000);
  }

  state.caption      = caption;
  state.scheduleTime = scheduleTime;
  pendingPost.delete(interaction.user.id);
  await processAndPost(interaction, state);
}

// ─── Core: watermark + post ───────────────────────────────────────────────────
async function processAndPost(interaction, state) {
  const basket     = await getBasket(state.guildId, state.channelId);
  const imageItems = basket.filter(r => r.type === 'image');
  const processed  = [];
  const wmErrors   = [];

  if (imageItems.length > 0) {
    if (state.wmType !== 'none') {
      const total = imageItems.length;
      await interaction.editReply({ content: `⏳ ติดลายน้ำ 0/${total} รูป...` });
      const imagePath = path.join(ASSETS_DIR, state.wmType);
      for (let i = 0; i < imageItems.length; i++) {
        try {
          const srcBuf = await fetchBuffer(imageItems[i].image_url);
          const { buffer, ext } = await applyWatermark(srcBuf, {
            imagePath, position: 'bottom-right', opacity: 0.8, size: 0.13,
          });
          processed.push({ buffer, ext });
        } catch (err) {
          wmErrors.push(`❌ รูป ${i + 1}: ${err.message}`);
        }
        interaction.editReply({ content: `⏳ ติดลายน้ำ ${i + 1}/${total} รูป...` }).catch(() => {});
      }
      if (!processed.length) {
        return interaction.editReply({ content: `❌ ติดลายน้ำไม่สำเร็จ\n${wmErrors.join('\n')}` });
      }
    } else {
      await interaction.editReply({ content: `⏳ กำลังดาวน์โหลดรูป...` });
      for (let i = 0; i < imageItems.length; i++) {
        try {
          let buffer     = await fetchBuffer(imageItems[i].image_url);
          const extMatch = imageItems[i].image_url.match(/\.(png|jpe?g|webp)/i);
          let ext        = extMatch ? extMatch[1].replace('jpeg', 'jpg') : 'jpg';
          if (ext === 'webp') {
            buffer = await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
            ext    = 'jpg';
          }
          processed.push({ buffer, ext });
        } catch (err) {
          wmErrors.push(`❌ รูป ${i + 1}: ${err.message}`);
        }
      }
      if (!processed.length) {
        return interaction.editReply({ content: `❌ ดาวน์โหลดรูปไม่สำเร็จ\n${wmErrors.join('\n')}` });
      }
    }
  }

  await interaction.editReply({ content: `📤 กำลังโพสต์...` });

  const { scheduleTime } = state;
  const results = [];
  let fbUrl = null;

  if (state.platform === 'fb' || state.platform === 'both') {
    try {
      const res = await postToFacebook(state.guildId, processed, state.caption, scheduleTime);
      if (res.id) {
        const parts = res.id.split('_');
        if (parts.length === 2) {
          fbUrl = `https://www.facebook.com/permalink.php?story_fbid=${parts[1]}&id=${parts[0]}`;
          const fbLabel = scheduleTime ? 'ตั้งเวลาแล้ว' : 'โพสต์แล้ว';
          results.push(`✅ Facebook ${fbLabel}\n🔗 [ดูโพสต์](${fbUrl}) · [จัดการโพสต์ทั้งหมด](https://www.facebook.com/professional_dashboard/content_calendar/)`);
        } else {
          results.push(scheduleTime ? '✅ Facebook ตั้งเวลาแล้ว' : '✅ Facebook โพสต์แล้ว');
        }
      } else {
        results.push(scheduleTime ? '✅ Facebook ตั้งเวลาแล้ว' : '✅ Facebook โพสต์แล้ว');
      }
    } catch (err) {
      results.push(`❌ Facebook: ${err.message}`);
    }
  }
  if (state.platform === 'ig' || state.platform === 'both') {
    try {
      const igRes = await postToInstagram(state.guildId, processed, state.caption, scheduleTime);
      const igLink = igRes?.permalink ? ` · [ดูโพสต์](${igRes.permalink})` : '';
      results.push(scheduleTime
        ? `✅ Instagram ตั้งเวลาแล้ว${igLink}`
        : `✅ Instagram โพสต์แล้ว${igLink}`);
    } catch (err) {
      results.push(`❌ Instagram: ${err.message}`);
    }
  }

  await clearBasket(state.guildId, state.channelId);

  const overallStatus = results.every(r => r.startsWith('✅')) ? 'success'
    : results.every(r => r.startsWith('❌')) ? 'failed' : 'partial';
  await addHistory(state.guildId, state.channelId, interaction.user.id, {
    platform:    state.platform,
    imageCount:  imageItems.length,
    wmType:      state.wmType !== 'none' ? state.wmType : null,
    caption:     state.caption || null,
    scheduleTime: state.scheduleTime || null,
    fbUrl,
    status:      overallStatus,
  }).catch(() => {});

  await setSetting(state.guildId, `last_post_${state.channelId}`, { fbUrl, postedAt: new Date() }).catch(() => {});
  await deleteSetting(state.guildId, `pending_ig_${state.channelId}`).catch(() => {});

  const total   = imageItems.length;
  const summary = [
    state.wmType !== 'none' && total > 0 ? `📊 ติดลายน้ำ ${processed.length}/${total} รูป` : null,
    ...results,
    ...(wmErrors.length ? [`⚠️ ${wmErrors.join(', ')}`] : []),
  ].filter(Boolean).join('\n');

  await interaction.editReply({ content: `✅ โพสต์เสร็จแล้ว\n${summary}` }).catch(() => {});
}

module.exports = {
  handleBasketAdd,
  handleBasketView,
  handleBasketClear,
  handleBasketPost,
  handleBasketRetry,
  handleBasketSelect,
  handleBasketModal,
};
