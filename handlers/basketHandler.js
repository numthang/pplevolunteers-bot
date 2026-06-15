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
  PermissionFlagsBits,
} = require('discord.js');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { addImages, addVideo, setCaption, appendCaption, getBasket, clearBasket, clearBasketMedia, addHistory, getHistory } = require('../db/mediaBasket');
const { fetchBuffer, applyWatermark, autoEnhance } = require('../utils/watermarkImage');
const { postToFacebook, postToInstagram, postToThreads, postReelsToInstagram, postReelsToFacebook, postReelsToThreads, getAvailablePlatforms, getAvailableGroups } = require('../services/metaApi');
const { postToX, postVideoToX } = require('../services/xApi');
const { getSetting, setSetting, deleteSetting } = require('../db/settings');
const { resolveConfig } = require('../db/configResolver');
const pool = require('../db/index');

const KEY_WATERMARK = 'default_watermark'; // ค่ากลาง — ตั้งที่หน้าเว็บ /bot/media/settings (ใช้ร่วม quote)
const groupWmKey = groupName => `default_watermark_group:${groupName}`;

const stateKey = channelId => `basket_state_${channelId}`;
async function getBasketState(guildId, channelId) {
  const v = await getSetting(guildId, stateKey(channelId));
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}
async function setBasketStatePartial(guildId, channelId, patch) {
  const cur = (await getBasketState(guildId, channelId)) || {};
  await setSetting(guildId, stateKey(channelId), { ...cur, ...patch });
}
async function clearBasketState(guildId, channelId) {
  await deleteSetting(guildId, stateKey(channelId));
}

const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'watermark');
const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime']);

const pendingPost = new Map(); // userId → { guildId, channelId, wmType, platform, caption?, scheduleTime? }

function getGroupWatermarkDir(guildId, groupName) {
  return path.join(ASSETS_DIR, guildId, groupName);
}

function getGroupWatermarkFiles(guildId, groupName) {
  try {
    return fs.readdirSync(getGroupWatermarkDir(guildId, groupName)).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
  } catch { return []; }
}

function getGuildRootFiles(guildId) {
  try {
    const dir = path.join(ASSETS_DIR, guildId);
    return fs.readdirSync(dir).filter(f => {
      if (!/\.(png|jpg|jpeg|webp)$/i.test(f)) return false;
      return fs.statSync(path.join(dir, f)).isFile();
    });
  } catch { return []; }
}

function getPersonalDir(userId) {
  return path.join(ASSETS_DIR, `user_${userId}`);
}

function getPersonalFiles(userId) {
  try {
    return fs.readdirSync(getPersonalDir(userId)).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
  } catch { return []; }
}

async function isPersonalGroup(guildId, groupName) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as cnt FROM dc_social_accounts
     WHERE guild_id = $1 AND group_name = $2 AND visibility = 'public'`,
    [guildId, groupName]
  );
  return parseInt(rows[0].cnt) === 0;
}

function resolveWatermarkPath(wmType, guildId, groupName, userId) {
  if (!wmType || wmType === 'none') return null;
  if (wmType.startsWith('personal:')) return path.join(getPersonalDir(userId), wmType.slice('personal:'.length));
  const filename = wmType.startsWith('guild:') ? wmType.slice('guild:'.length) : wmType;
  return groupName
    ? path.join(getGroupWatermarkDir(guildId, groupName), filename)
    : path.join(ASSETS_DIR, guildId, filename);
}

function stripExt(f) {
  return f.replace(/\.[^.]+$/, '').replace(/^\d+-/, '');
}

function stripDiscordMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\|\|([^|]+)\|\|/g, '$1')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function buildBasketEmbed(imgCount, videoCount, caption, previewUrl = null) {
  const mediaLabel = videoCount > 0
    ? (imgCount > 0 ? `${imgCount} รูป + ${videoCount} วิดีโอ` : `${videoCount} วิดีโอ 🎬`)
    : `${imgCount} รูป`;
  const embed = new EmbedBuilder()
    .setColor(0xff6a13)
    .setTitle(`🧺 ตะกร้าสื่อ — ${mediaLabel}`);
  if (caption) embed.setDescription(caption.length > 280 ? caption.slice(0, 280) + '…' : caption);
  else embed.setDescription('*ยังไม่มี caption*');
  if (previewUrl) embed.setImage(previewUrl);
  if (imgCount > 0 && videoCount > 0) {
    embed.addFields({ name: '⚠️ ผสม media', value: 'มีทั้งรูปและวิดีโอ — ลบออกให้เหลือประเภทเดียวก่อนโพสต์', inline: false });
  }
  return embed;
}

function buildBasketButtons(imgCount, videoCount, hasCaption = false, webUrl = null) {
  const empty = imgCount === 0 && videoCount === 0 && !hasCaption;
  const mixed = imgCount > 0 && videoCount > 0;
  const row1 = [
    new ButtonBuilder()
      .setCustomId('basket_post')
      .setLabel('📋 สร้างโพสต์')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(empty || mixed),
    new ButtonBuilder()
      .setCustomId('basket_edit_caption')
      .setLabel('✏️ แก้ Caption')
      .setStyle(ButtonStyle.Primary),
  ];
  if (hasCaption) {
    row1.push(
      new ButtonBuilder()
        .setCustomId('basket_ai_compose')
        .setLabel('🤖 AI ปรับ Caption')
        .setStyle(ButtonStyle.Success),
    );
  }
  if (webUrl && imgCount >= 1) {
    row1.push(
      new ButtonBuilder()
        .setLabel('🖼️ จัดการรูป')
        .setStyle(ButtonStyle.Link)
        .setURL(webUrl),
    );
  }
  const row2 = [
    new ButtonBuilder()
      .setCustomId('basket_view_public')
      .setLabel('👁️ แสดงตะกร้า')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('basket_clear')
      .setLabel('🗑️ ล้าง')
      .setStyle(ButtonStyle.Secondary),
  ];
  return [
    new ActionRowBuilder().addComponents(...row1),
    new ActionRowBuilder().addComponents(...row2),
  ];
}

function buildGroupRow(groups, currentGroup) {
  const opts = groups.map(g =>
    new StringSelectMenuOptionBuilder().setLabel(g).setValue(g).setEmoji('📦').setDefault(g === currentGroup)
  );
  if (!opts.length) return null;
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('basket_group').setPlaceholder('เลือกกลุ่มโพสต์').addOptions(opts)
  );
}

function buildPlatformRow(availablePlatforms, selectedPlatforms) {
  const meta = {
    fb:      { label: 'FB',  emoji: '📘' },
    ig:      { label: 'IG',  emoji: '📷' },
    threads: { label: '@',   emoji: '🧵' },
    x:       { label: 'X',  emoji: '🐦' },
  };
  const order = ['fb', 'ig', 'threads', 'x'];
  const opts = order
    .filter(p => availablePlatforms.includes(p))
    .map(p => {
      const o = new StringSelectMenuOptionBuilder()
        .setLabel(meta[p].label)
        .setValue(p)
        .setDefault(selectedPlatforms.includes(p));
      if (meta[p].emoji) o.setEmoji(meta[p].emoji);
      return o;
    });
  if (!opts.length) return null;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('basket_platform')
      .setPlaceholder('เลือก platform (กดได้หลายอัน)')
      .setMinValues(1)
      .setMaxValues(opts.length)
      .addOptions(opts)
  );
}

// ─── shared: build full basket reply payload ──────────────────────────────────
async function buildBasketPayload(basket, guildId, channelId, userId, channelName = null) {
  const images  = basket.filter(r => r.type === 'image');
  const videos  = basket.filter(r => r.type === 'video');
  const caption = basket.find(r => r.type === 'caption')?.caption || null;
  const imgCount   = images.length;
  const videoCount = videos.length;

  const msgIds = [...new Set(images.map(r => r.message_id).filter(Boolean))];
  const links  = msgIds.map((id, i) =>
    `[ดูรูปชุดที่ ${i + 1}](https://discord.com/channels/${guildId}/${channelId}/${id})`
  );
  const videoMsgId = videos[0]?.message_id;
  if (videoMsgId) links.push(`[ดูวิดีโอต้นทาง 🎬](https://discord.com/channels/${guildId}/${channelId}/${videoMsgId})`);

  const previewUrl = images.length
    ? images[Math.floor(Math.random() * images.length)].image_url
    : null;

  const embed = buildBasketEmbed(imgCount, videoCount, caption, previewUrl);
  if (links.length) {
    const parts = [];
    for (const l of links) {
      const candidate = parts.length ? parts.join(' · ') + ' · ' + l : l;
      if (candidate.length > 1024) { parts.push('…'); break; }
      parts.push(l);
    }
    embed.addFields({ name: '🖼️ ต้นทาง', value: parts.join(' · '), inline: false });
  }

  const saved = await getBasketState(guildId, channelId);
  const groups = await getAvailableGroups(guildId, userId);
  const currentGroup = saved?.group && groups.includes(saved.group) ? saved.group : (groups[0] || null);

  const availablePlatforms = await getAvailablePlatforms(guildId, userId, currentGroup);
  // saved.platforms must be subset of available; otherwise default = all available
  const savedPlatforms = Array.isArray(saved?.platforms) ? saved.platforms.filter(p => availablePlatforms.includes(p)) : [];
  const selectedPlatforms = savedPlatforms.length ? savedPlatforms : [...availablePlatforms];
  // ยังไม่เคยเลือก watermark → ลอง per-group default ก่อน แล้วค่อย fallback guild/global
  // เฉพาะเมื่อไฟล์มีจริงใน context นี้ (group/guild/personal) ไม่งั้น 'none'
  let defaultWmType = 'none';
  if (saved?.wmType == null) {
    try {
      let resolved = null;
      if (currentGroup) {
        const groupDefault = await getSetting(guildId, groupWmKey(currentGroup));
        if (groupDefault) resolved = groupDefault;
      }
      if (!resolved) {
        const { value } = await resolveConfig(userId, guildId, KEY_WATERMARK);
        if (value) resolved = value;
      }
      if (resolved) {
        const p = resolveWatermarkPath(resolved, guildId, currentGroup, userId);
        if (p && fs.existsSync(p)) defaultWmType = resolved;
      }
    } catch (err) {
      console.error('[basket] resolve default watermark:', err.message);
    }
  }
  const currentWmType = saved?.wmType ?? defaultWmType;

  const history = await getHistory(guildId, channelId);
  if (history.length) {
    const platformIcon = { fb: '📘', ig: '📷', threads: '🧵', x: '𝕏' };
    const lines = history.map(h => {
      const hPlats = (h.platform || '').split(',').filter(Boolean);
      const icon = hPlats.length > 1 ? '📲' : (platformIcon[hPlats[0]] || '📤');
      const grp  = h.group_name ? ` [${h.group_name}]` : '';
      const imgs = h.image_count > 0 ? ` · ${h.image_count}` : (h.video_count > 0 ? ' · 🎬' : '');
      const links = [h.fb_url && '[FB]('+h.fb_url+')', h.ig_url && '[IG]('+h.ig_url+')', h.threads_url && '[@]('+h.threads_url+')', h.x_url && '[𝕏]('+h.x_url+')'].filter(Boolean);
      const link  = links.length ? ` · ${links.join(' · ')}` : '';
      const fail  = h.status !== 'success' ? ' ⚠️' : '';
      return `${icon}${grp}${imgs}${link}${fail}`;
    });
    // Discord field value limit: 1024 chars — keep newest entries that fit
    let totalLen = 0;
    const fitted = [];
    for (const line of lines) {
      if (totalLen + line.length + 1 > 1024) break;
      fitted.push(line);
      totalLen += line.length + 1;
    }
    embed.addFields({ name: '📋 ประวัติการโพสต์', value: fitted.join('\n') || '—', inline: false });
  }

  pendingPost.set(userId, {
    guildId, channelId, userId,
    wmType:    currentWmType,
    platforms: selectedPlatforms,
    group:     currentGroup,
    caption:   caption || '',
  });

  const components = [];
  const groupRow = buildGroupRow(groups, currentGroup);
  if (groupRow) components.push(groupRow);
  const platformRow = buildPlatformRow(availablePlatforms, selectedPlatforms);
  if (platformRow) components.push(platformRow);

  const canShowWatermark = currentGroup || groups.length === 0;
  if (imgCount > 0 && canShowWatermark) {
    const isPersonal = currentGroup ? await isPersonalGroup(guildId, currentGroup) : false;
    const wmFiles = currentGroup
      ? (isPersonal ? getPersonalFiles(userId) : getGroupWatermarkFiles(guildId, currentGroup))
      : getGuildRootFiles(guildId);
    if (wmFiles.length) {
      const currentWm = pendingPost.get(userId)?.wmType || 'none';
      const prefix = isPersonal ? 'personal' : 'guild';
      components.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('basket_wm_type')
          .setPlaceholder('ลายน้ำ (default: ไม่มี)')
          .addOptions([
            new StringSelectMenuOptionBuilder().setLabel('ไม่มีลายน้ำ').setValue('none').setDefault(currentWm === 'none'),
            ...wmFiles.map(f => {
              const opt = new StringSelectMenuOptionBuilder()
                .setLabel(`ลายน้ำ ${stripExt(f)}`)
                .setValue(`${prefix}:${f}`)
                .setDefault(currentWm === `${prefix}:${f}`);
              if (isPersonal) opt.setEmoji('🔒');
              return opt;
            }),
          ])
      ));
    }
    // const currentEnhance = pendingPost.get(userId)?.enhance || false;
    // components.push(new ActionRowBuilder().addComponents(
    //   new StringSelectMenuBuilder()
    //     .setCustomId('basket_enhance')
    //     .setPlaceholder('Auto Enhance (default: ปิด)')
    //     .addOptions([
    //       new StringSelectMenuOptionBuilder().setLabel('ไม่ Enhance').setValue('off').setEmoji('🖼️').setDefault(!currentEnhance),
    //       new StringSelectMenuOptionBuilder().setLabel('Auto Enhance').setValue('on').setEmoji('✨').setDefault(currentEnhance),
    //     ])
    // ));
  }
  const webUrl = (() => {
    if (!process.env.WEB_BASE_URL) return null;
    const base = `${process.env.WEB_BASE_URL}/bot/media/basket?guild=${guildId}&channel=${channelId}`;
    if (!channelName) return base;
    const budget = 512 - base.length - 6; // 6 = len('&name=')
    let encoded = encodeURIComponent(channelName);
    if (encoded.length > budget) {
      encoded = encoded.slice(0, budget).replace(/%[0-9A-F]?$/i, ''); // ไม่ตัดกลาง %XX
    }
    return `${base}&name=${encoded}`;
  })();
  components.push(...buildBasketButtons(imgCount, videoCount, !!caption, webUrl));

  return { embeds: [embed], components };
}

// ─── Add to basket ────────────────────────────────────────────────────────────
async function handleBasketAdd(interaction) {
  const msg = interaction.targetMessage;
  let sourceMsg = msg;
  if (msg.attachments.size === 0 && msg.flags?.has('HasSnapshot')) {
    const snap = msg.messageSnapshots?.[0] ?? msg.messageSnapshots?.first?.();
    if (snap?.channelId && snap?.id) {
      try {
        const srcChannel = interaction.guild.channels.cache.get(snap.channelId);
        if (srcChannel) sourceMsg = await srcChannel.messages.fetch(snap.id);
      } catch { /* ถ้า fetch ไม่ได้ใช้ msg เดิม */ }
    }
  }
  const images = [...sourceMsg.attachments.values()].filter(a => {
    const ct = a.contentType?.split(';')[0].trim();
    return SUPPORTED_TYPES.has(ct);
  });
  const videos = [...sourceMsg.attachments.values()].filter(a => {
    const ct = a.contentType?.split(';')[0].trim();
    return VIDEO_TYPES.has(ct);
  });
  const text = sourceMsg.content ? stripDiscordMarkdown(sourceMsg.content) : '';

  if (!images.length && !videos.length && !text) {
    return interaction.reply({ content: '❌ ข้อความนี้ไม่มีรูป วิดีโอ (.mp4) หรือข้อความ', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { guildId, channelId } = interaction;
  const addedBy = interaction.user.id;
  const isBot = msg.author?.bot ?? false;
  const channelName = interaction.channel?.name || null;

  if (videos.length > 1) return interaction.editReply({ content: '❌ เพิ่มได้แค่ 1 วิดีโอต่อครั้ง' });

  if (images.length) await addImages(guildId, channelId, addedBy, images.map(a => ({ url: a.url })), msg.id, channelName);
  if (videos.length) await addVideo(guildId, channelId, addedBy, videos.map(a => ({ url: a.url })), msg.id, channelName);
  if (text && !isBot && !images.length && !videos.length) await appendCaption(guildId, channelId, addedBy, text, msg.id, channelName);

  const basket = await getBasket(guildId, channelId);
  const added = [
    images.length ? `🖼️ ${images.length} รูป` : null,
    videos.length ? `🎬 1 วิดีโอ` : null,
    text && !isBot && !images.length && !videos.length ? `📝 caption (ต่อท้าย)` : null,
  ].filter(Boolean).join(' + ');

  const payload = await buildBasketPayload(basket, guildId, channelId, interaction.user.id, interaction.channel?.name);
  await interaction.editReply({ content: `✅ เพิ่ม ${added} แล้ว`, ...payload });
}

// ─── View basket ──────────────────────────────────────────────────────────────
async function handleBasketView(interaction) {
  const { guildId, channelId } = interaction;
  const basket = await getBasket(guildId, channelId);

  if (!basket.length) {
    return interaction.reply({ content: '🧺 ตะกร้าสื่อว่างเปล่า', flags: MessageFlags.Ephemeral });
  }

  const payload = await buildBasketPayload(basket, guildId, channelId, interaction.user.id, interaction.channel?.name);
  await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

// ─── Clear basket ─────────────────────────────────────────────────────────────
async function handleBasketClear(interaction) {
  await clearBasket(interaction.guildId, interaction.channelId);
  await clearBasketState(interaction.guildId, interaction.channelId).catch(() => {});
  await interaction.reply({ content: '🗑️ ล้างตะกร้าสื่อแล้ว', flags: MessageFlags.Ephemeral });
}

// ─── สร้างโพสต์: open modal ───────────────────────────────────────────────────
async function rehydrateState(interaction) {
  const { guildId, channelId } = interaction;
  const userId = interaction.user.id;
  const saved = await getBasketState(guildId, channelId);
  const groups = await getAvailableGroups(guildId, userId);
  const group = saved?.group && groups.includes(saved.group) ? saved.group : (groups[0] || null);
  const availablePlatforms = await getAvailablePlatforms(guildId, userId, group);
  const savedPlatforms = Array.isArray(saved?.platforms) ? saved.platforms.filter(p => availablePlatforms.includes(p)) : [];
  const platforms = savedPlatforms.length ? savedPlatforms : [...availablePlatforms];
  const basket = await getBasket(guildId, channelId);
  const caption = basket.find(r => r.type === 'caption')?.caption || '';
  const state = {
    guildId, channelId, userId,
    wmType: saved?.wmType ?? 'none',
    platforms,
    group,
    caption,
  };
  pendingPost.set(userId, state);
  return state;
}

async function handleBasketPost(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({ content: '❌ ไม่มีสิทธิ์สร้างโพสต์', flags: MessageFlags.Ephemeral });
  }
  let state = pendingPost.get(interaction.user.id);
  if (state?.posting) {
    return interaction.reply({ content: '⏳ กำลังโพสต์อยู่ กรุณารอสักครู่', flags: MessageFlags.Ephemeral });
  }
  if (!state) state = await rehydrateState(interaction);
  // caption อาจถูกแก้บนเว็บหลัง embed นี้ถูก render — ดึงสดจาก DB เสมอ ไม่ใช้ของที่ค้างใน memory
  const basket = await getBasket(interaction.guildId, interaction.channelId);
  const hasImages = basket.some(r => r.type === 'image');
  const hasVideo  = basket.some(r => r.type === 'video');
  if (hasImages && hasVideo) {
    return interaction.reply({ content: '❌ ตะกร้ามีทั้งรูปและวิดีโอ — ลบออกให้เหลือประเภทเดียวก่อน\nกด 🖼️ จัดการรูป หรือ 🗑️ ล้าง', flags: MessageFlags.Ephemeral });
  }
  const freshCaption = basket.find(r => r.type === 'caption')?.caption || '';
  state.caption = freshCaption;
  return openScheduleModal(interaction, freshCaption, state.platforms || []);
}

// ─── Retry button (after date parse error) ────────────────────────────────────
async function handleBasketRetry(interaction) {
  let state = pendingPost.get(interaction.user.id);
  if (!state) state = await rehydrateState(interaction);
  return openScheduleModal(interaction, state.caption || '', state.platforms || []);
}

// ─── Select menus ─────────────────────────────────────────────────────────────
async function handleBasketSelect(interaction) {
  try {
    await interaction.deferUpdate();
    const state = pendingPost.get(interaction.user.id);
    const { guildId, channelId } = interaction;
    if (interaction.customId === 'basket_wm_type') {
      if (state) state.wmType = interaction.values[0];
      setBasketStatePartial(guildId, channelId, { wmType: interaction.values[0] }).catch(() => {});
    }
    if (interaction.customId === 'basket_platform') {
      if (state) state.platforms = interaction.values;
      setBasketStatePartial(guildId, channelId, { platforms: interaction.values }).catch(e => console.error('[basket_platform setState]', e));
    }
    if (interaction.customId === 'basket_group') {
      if (state) { state.group = interaction.values[0]; state.wmType = null; }
      // ต้อง await ก่อน re-render — ไม่งั้น buildBasketPayload จะอ่าน group เก่าจาก DB
      // wmType: null เพื่อให้ default resolution รันใหม่ตาม per-group default ของ group ใหม่
      await setBasketStatePartial(guildId, channelId, { group: interaction.values[0], wmType: null }).catch(e => console.error('[basket_group setState]', e));
      const basket = await getBasket(guildId, channelId);
      const payload = await buildBasketPayload(basket, guildId, channelId, interaction.user.id, interaction.channel?.name);
      await interaction.editReply(payload).catch(e => console.error('[basket_group editReply]', e));
    }
    // if (interaction.customId === 'basket_enhance' && state) state.enhance = interaction.values[0] === 'on';
  } catch (err) {
    if (err.code !== 10062) console.error('[basketSelect]', err);
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

const PLATFORM_LABEL = { fb: 'Facebook', ig: 'Instagram', threads: '@ Threads', x: 'X' };
const PLATFORM_SHORT = { fb: 'FB', ig: 'IG', threads: '@', x: 'X' };

function formatPlatforms(platforms) {
  return (platforms || []).map(p => PLATFORM_SHORT[p] || p).join(' + ');
}

function openScheduleModal(interaction, existingCaption, platforms) {
  // unique customId to bypass Discord client modal cache (forces fresh render)
  const cid = `basket_schedule_modal:${Date.now()}`;
  const label = formatPlatforms(platforms);
  const title = label ? `โพสต์ลง ${label}` : 'สร้างโพสต์';
  const modal = new ModalBuilder().setCustomId(cid).setTitle(title);

  const captionInput = new TextInputBuilder()
    .setCustomId('basket_caption')
    .setLabel('Caption (เว้นว่างได้)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(4000);

  // setValue only if non-empty (some Discord.js versions silently drop empty value)
  if (existingCaption && existingCaption.length > 0) {
    captionInput.setValue(existingCaption.slice(0, 4000));
  }

  const timeInput = new TextInputBuilder()
    .setCustomId('basket_schedule_time')
    .setLabel('วันเวลาโพสต์ (เว้นว่าง = โพสต์เดี๋ยวนี้)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(20)
    .setValue(defaultScheduleTime());

  modal.addComponents(
    new ActionRowBuilder().addComponents(timeInput),
    new ActionRowBuilder().addComponents(captionInput),
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
  // เซฟ caption ที่แก้ใน modal กลับ DB ให้ตะกร้า (เว็บ + โพสต์ครั้งหน้า) sync กัน
  await setCaption(interaction.guildId, interaction.channelId, interaction.user.id, caption, null).catch(() => {});
  state.posting      = true;
  try {
    await processAndPost(interaction, state);
  } finally {
    state.posting = false;
  }
}

// ─── Core: watermark + post ───────────────────────────────────────────────────
async function processAndPost(interaction, state) {
  const basket     = await getBasket(state.guildId, state.channelId);
  const imageItems = basket.filter(r => r.type === 'image');
  const videoItems = basket.filter(r => r.type === 'video');
  const processed  = [];
  const wmErrors   = [];

  // ─── Video (Reels) path ──────────────────────────────────────────────────────
  if (videoItems.length > 0) {
    if (imageItems.length > 0) {
      return interaction.editReply({ content: '❌ ตะกร้ามีทั้งรูปและวิดีโอ — ล้างแล้วโพสต์ทีละประเภท' });
    }
    const platforms   = state.platforms || [];
    const { scheduleTime } = state;
    const results = [];
    let igUrl = null;

    if (platforms.includes('ig')) {
      const igMsg = scheduleTime ? '📤 IG Reels ไม่รองรับตั้งเวลา — โพสต์ทันที...' : '📤 กำลังโพสต์ Reels ไปยัง Instagram...';
      await interaction.editReply({ content: igMsg }).catch(() => {});
      try {
        const igProgress = msg => interaction.editReply({ content: msg }).catch(() => {});
        const igRes = await postReelsToInstagram(state.guildId, interaction.user.id, videoItems[0].image_url, state.caption, igProgress, state.group);
        igUrl = igRes?.permalink || null;
        const igLink = igUrl ? ` · 🔗 [ดูโพสต์](${igUrl})` : '';
        const igNote = scheduleTime ? ' (IG Reels ไม่รองรับตั้งเวลา)' : '';
        results.push(`✅ Instagram Reels โพสต์แล้ว${igLink}${igNote}`);
      } catch (err) {
        results.push(`❌ Instagram Reels: ${err.message}`);
      }
    }
    if (platforms.includes('fb')) {
      await interaction.editReply({ content: '📤 กำลังโพสต์ Reels ไปยัง Facebook...' }).catch(() => {});
      try {
        const fbProgress = msg => interaction.editReply({ content: msg }).catch(() => {});
        const fbRes = await postReelsToFacebook(state.guildId, interaction.user.id, videoItems[0].image_url, state.caption, fbProgress, state.group, scheduleTime);
        const fbLink = fbRes?.permalink ? ` · 🔗 [ดูโพสต์](${fbRes.permalink})` : '';
        const fbLabel = scheduleTime ? 'ตั้งเวลาแล้ว' : 'โพสต์แล้ว';
        results.push(`✅ Facebook Reels ${fbLabel}${fbLink}`);
      } catch (err) {
        results.push(`❌ Facebook Reels: ${err.message}`);
      }
    }
    if (platforms.includes('threads')) {
      await interaction.editReply({ content: '📤 กำลังโพสต์ Reels ไปยัง Threads...' }).catch(() => {});
      try {
        const thProgress = msg => interaction.editReply({ content: msg }).catch(() => {});
        const thRes = await postReelsToThreads(state.guildId, interaction.user.id, videoItems[0].image_url, state.caption, thProgress, state.group);
        const thLink = thRes?.permalink ? ` · 🔗 [ดูโพสต์](${thRes.permalink})` : '';
        results.push(`✅ Threads Reels โพสต์แล้ว${thLink}`);
      } catch (err) {
        results.push(`❌ Threads Reels: ${err.message}`);
      }
    }
    if (platforms.includes('x')) {
      await interaction.editReply({ content: '📤 กำลังโพสต์วิดีโอไปยัง X...' }).catch(() => {});
      try {
        const xRes = await postVideoToX(state.guildId, interaction.user.id, videoItems[0].image_url, state.caption, state.group);
        const xLink = xRes?.url ? ` · 🔗 [ดูโพสต์](${xRes.url})` : '';
        results.push(`✅ X โพสต์วิดีโอแล้ว${xLink}`);
      } catch (err) {
        results.push(`❌ X video: ${err.message}`);
      }
    }

    const overallStatus = results.every(r => r.startsWith('✅')) ? 'success'
      : results.every(r => r.startsWith('❌')) ? 'failed' : 'partial';
    await addHistory(state.guildId, state.channelId, interaction.user.id, {
      platform: platforms.join(','), imageCount: 0, videoCount: 1,
      wmType: null, caption: state.caption || null, scheduleTime: null,
      fbUrl: null, igUrl, threadsUrl: null, xUrl: null, status: overallStatus,
      groupName: state.group || null,
    }).catch(() => {});
    await interaction.followUp({ content: ['✅ โพสต์เสร็จแล้ว', ...results].join('\n') }).catch(() => {});
    return;
  }

  if (imageItems.length > 0) {
    if (state.wmType !== 'none') {
      const total = imageItems.length;
      await interaction.editReply({ content: `⏳ ติดลายน้ำ 0/${total} รูป...` });
      const imagePath = resolveWatermarkPath(state.wmType, state.guildId, state.group, state.userId);
      for (let i = 0; i < imageItems.length; i++) {
        try {
          let srcBuf = await fetchBuffer(imageItems[i].image_url);
          // if (state.enhance) srcBuf = await autoEnhance(srcBuf);
          const { buffer, ext } = await applyWatermark(srcBuf, {
            imagePath, position: 'random', opacity: 0.8, size: 0.13,
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
          // if (state.enhance) buffer = await autoEnhance(buffer);
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

  const { scheduleTime } = state;
  const results = [];
  let fbUrl = null, igUrl = null, threadsUrl = null, xUrl = null;
  const platforms = state.platforms || [];
  const postFb      = platforms.includes('fb');
  const postIg      = platforms.includes('ig');
  const postThreads = platforms.includes('threads');
  const postX       = platforms.includes('x');

  if (postFb) {
    await interaction.editReply({ content: '📤 กำลังโพสต์ไปยัง Facebook...' }).catch(() => {});
    try {
      const res = await postToFacebook(state.guildId, interaction.user.id, processed, state.caption, scheduleTime, state.group);
      if (res.id) {
        const parts = res.id.split('_');
        if (parts.length === 2) {
          fbUrl = `https://www.facebook.com/permalink.php?story_fbid=${parts[1]}&id=${parts[0]}`;
        }
      }
      const fbLabel = scheduleTime ? 'ตั้งเวลาแล้ว' : 'โพสต์แล้ว';
      const fbLinks = fbUrl
        ? ` · 🔗 [ดูโพสต์](${fbUrl}) · [จัดการโพสต์ทั้งหมด](https://www.facebook.com/professional_dashboard/content_calendar/)`
        : '';
      results.push(`✅ Facebook ${fbLabel}${fbLinks}`);
    } catch (err) {
      results.push(`❌ Facebook: ${err.message}`);
    }
  }
  if (postIg) {
    const igMsg = scheduleTime ? '📤 IG ไม่รองรับตั้งเวลา — โพสต์ทันที...' : '📤 กำลังโพสต์ไปยัง Instagram...';
    await interaction.editReply({ content: igMsg }).catch(() => {});
    try {
      const igProgress = msg => interaction.editReply({ content: msg }).catch(() => {});
      const igRes = await postToInstagram(state.guildId, interaction.user.id, processed, state.caption, null, igProgress, state.group);
      igUrl = igRes?.permalink || null;
      const igLink = igUrl ? ` · 🔗 [ดูโพสต์](${igUrl})` : '';
      const igNote = scheduleTime ? ' (IG ไม่รองรับตั้งเวลา)' : '';
      results.push(`✅ Instagram โพสต์แล้ว${igLink}${igNote}`);
    } catch (err) {
      results.push(`❌ Instagram: ${err.message}`);
    }
  }

  if (postThreads) {
    await interaction.editReply({ content: '📤 กำลังโพสต์ไปยัง @ Threads...' }).catch(() => {});
    try {
      const thProgress = msg => interaction.editReply({ content: msg }).catch(() => {});
      const thRes = await postToThreads(state.guildId, interaction.user.id, processed, state.caption, thProgress, state.group);
      threadsUrl = thRes?.permalink || null;
      const thLink = threadsUrl ? ` · 🔗 [ดูโพสต์](${threadsUrl})` : '';
      results.push(`✅ @ Threads โพสต์แล้ว${thLink}`);
    } catch (err) {
      results.push(`❌ Threads: ${err.message}`);
    }
  }

  if (postX) {
    await interaction.editReply({ content: '📤 กำลังโพสต์ไปยัง X...' }).catch(() => {});
    try {
      const xRes = await postToX(state.guildId, interaction.user.id, processed, state.caption, state.group);
      xUrl = xRes?.url || null;
      const xLink = xUrl ? ` · 🔗 [ดูโพสต์](${xUrl})` : '';
      const xThread = xRes?.threadCount > 1 ? ` (thread ${xRes.threadCount} tweets${xRes.urlCount ? `, ${xRes.urlCount} link ใน reply` : ''})` : '';
      const xNote = xRes?.truncated ? ' ⚠️ caption เกิน limit — ตัดส่วนเกินทิ้ง' : '';
      results.push(`✅ X (Twitter) โพสต์แล้ว${xThread}${xLink}${xNote}`);
    } catch (err) {
      results.push(`❌ X: ${err.message}`);
    }
  }

  const overallStatus = results.every(r => r.startsWith('✅')) ? 'success'
    : results.every(r => r.startsWith('❌')) ? 'failed' : 'partial';
  await addHistory(state.guildId, state.channelId, interaction.user.id, {
    platform:    platforms.join(','),
    imageCount:  imageItems.length,
    videoCount:  0,
    wmType:      state.wmType !== 'none' ? state.wmType : null,
    caption:     state.caption || null,
    scheduleTime: state.scheduleTime || null,
    fbUrl, igUrl, threadsUrl, xUrl,
    status:      overallStatus,
    groupName:   state.group || null,
  }).catch(() => {});

  await setSetting(state.guildId, `last_post_${state.channelId}`, { fbUrl, postedAt: new Date() }).catch(() => {});
  await deleteSetting(state.guildId, `pending_ig_${state.channelId}`).catch(() => {});

  const total = imageItems.length;
  const lines = [
    '✅ โพสต์เสร็จแล้ว',
    state.wmType !== 'none' && total > 0 ? `✅ ติดลายน้ำ ${processed.length}/${total} รูป` : null,
    ...results,
    ...(wmErrors.length ? [`⚠️ ${wmErrors.join(', ')}`] : []),
  ].filter(Boolean);

  await interaction.followUp({ content: lines.join('\n') }).catch(() => {});
}

// ─── View basket public ───────────────────────────────────────────────────────
async function handleBasketViewPublic(interaction) {
  const { guildId, channelId } = interaction;
  const basket = await getBasket(guildId, channelId);
  if (!basket.length) {
    return interaction.reply({ content: '🧺 ตะกร้าสื่อว่างเปล่า', flags: MessageFlags.Ephemeral });
  }
  await interaction.deferUpdate();
  const payload = await buildBasketPayload(basket, guildId, channelId, interaction.user.id, interaction.channel?.name);
  await interaction.followUp({ ...payload });
}

// ─── Edit caption button ──────────────────────────────────────────────────────
async function handleBasketEditCaption(interaction) {
  const { guildId, channelId } = interaction;
  const basket = await getBasket(guildId, channelId);
  const existing = basket.find(r => r.type === 'caption')?.caption || '';

  const cid = `basket_caption_edit_modal:${Date.now()}`;
  const modal = new ModalBuilder().setCustomId(cid).setTitle('แก้ Caption');
  const input = new TextInputBuilder()
    .setCustomId('basket_caption_edit')
    .setLabel('Caption')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(4000);
  if (existing) input.setValue(existing.slice(0, 4000));
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

async function handleBasketCaptionEditModal(interaction) {
  const caption = interaction.fields.getTextInputValue('basket_caption_edit').trim();
  const { guildId, channelId } = interaction;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await setCaption(guildId, channelId, interaction.user.id, caption, null);

  const basket = await getBasket(guildId, channelId);
  const payload = await buildBasketPayload(basket, guildId, channelId, interaction.user.id, interaction.channel?.name);
  await interaction.editReply({ content: '✅ แก้ caption แล้ว', ...payload });
}

module.exports = {
  handleBasketAdd,
  handleBasketView,
  handleBasketClear,
  handleBasketPost,
  handleBasketRetry,
  handleBasketSelect,
  handleBasketModal,
  handleBasketEditCaption,
  handleBasketCaptionEditModal,
  handleBasketViewPublic,
  buildBasketPayload,
  stripDiscordMarkdown,
};
