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
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits,
  LabelBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventEntityType,
} = require('discord.js');
const path = require('path');
const fs = require('fs');
const { addImages, addVideo, setCaption, appendCaption, getBasket, clearBasket, clearBasketMedia,
        getHistory, getOpenEpisode, downloadPending } = require('../db/mediaBasket');
const { orgIdOfGuild, userIdByDiscord } = require('../db/org');
const { fetchBuffer } = require('../utils/watermarkImage');   // เหลือใช้จุดเดียว (พรีวิวรูปแรก) — ติดลายน้ำย้ายไป publishPipeline แล้ว
const storage = require('../utils/postsStorage');
const { getAvailablePlatforms, getAvailableGroups } = require('../services/metaApi');
// ⚠️ ห้าม import postTo*/postReels* ตรงๆ ที่นี่ — การโพสต์ต้องผ่านท่อกลางเท่านั้น (กติกาข้อ 16)
const { prepareImages, loadMediaSources, publishBatch } = require('../services/publishPipeline');
const { refreshAttachmentUrls, refreshUrlList } = require('../services/discordAttachments');
const { getSetting, setSetting, deleteSetting } = require('../db/settings');
const { getNewsChannelId, postNews, buildEventAnnouncement, sendOrQueueAnnouncement } = require('../services/newsShare');
const { resolveConfig } = require('../db/configResolver');
const pool = require('../db/index');
const wm = require('../services/watermarkPaths');

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

const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime']);

const pendingPost = new Map(); // userId → { guildId, channelId, wmType, platform, caption?, scheduleTime? }

// ลายน้ำผูกกับ org/users.id แล้ว ไม่ใช่ guild/Discord ID — แปลงที่ services/watermarkPaths.js
// token ที่เก็บในสถานะตะกร้ายังเป็น 'guild:<ไฟล์>' เหมือนเดิม (อ่านว่า "ของกลุ่ม/องค์กร")

async function getGroupWatermarkFiles(guildId, groupName) {
  return wm.listImgs(wm.groupDir(await wm.orgIdOf(guildId), groupName));
}

/** ยังไม่ได้เลือกกลุ่ม → รวมลายน้ำของทั้ง org (root + ทุกกลุ่ม) · เดิมคือไฟล์ที่ root ของ guild */
async function getOrgAllFiles(guildId) {
  return wm.listImgsRec(wm.orgDir(await wm.orgIdOf(guildId)));
}

async function getPersonalFiles(discordId) {
  return wm.listImgs(wm.personalDir(await wm.userIdOf(discordId)));
}

async function isPersonalGroup(guildId, groupName) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as cnt FROM dc_social_accounts
     WHERE guild_id = $1 AND group_name = $2 AND visibility = 'public'`,
    [guildId, groupName]
  );
  return parseInt(rows[0].cnt) === 0;
}

async function resolveWatermarkPath(wmType, guildId, groupName, discordId) {
  if (!wmType || wmType === 'none') return null;
  if (wmType.startsWith('personal:')) {
    const dir = wm.personalDir(await wm.userIdOf(discordId));
    return dir ? path.join(dir, wmType.slice('personal:'.length)) : null;
  }
  const filename = wmType.startsWith('guild:') ? wmType.slice('guild:'.length) : wmType;
  const orgId = await wm.orgIdOf(guildId);
  if (!orgId) return null;
  // ไม่ได้เลือกกลุ่ม → ค่าอาจเป็น '<กลุ่ม>/<ไฟล์>' จาก getOrgAllFiles() ต่อจาก org dir ตรงๆ ได้เลย
  const dir = groupName ? wm.groupDir(orgId, groupName) : wm.orgDir(orgId);
  return path.join(dir, filename);
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
    embed.addFields({ name: '⚠️ ผสม media', value: 'มีทั้งรูปและวิดีโอ — กด 🖼️ จัดการสื่อ ลบออกให้เหลือประเภทเดียวก่อนโพสต์', inline: false });
  } else if (videoCount > 1) {
    embed.addFields({ name: '⚠️ วิดีโอหลายคลิป', value: 'โพสต์ได้ครั้งละคลิปเดียว — กด 🖼️ จัดการสื่อ ลบให้เหลือคลิปเดียวก่อนโพสต์', inline: false });
  }
  return embed;
}

function buildBasketButtons(imgCount, videoCount, hasCaption = false, webUrl = null) {
  const empty = imgCount === 0 && videoCount === 0 && !hasCaption;
  // โพสต์ไม่ได้จนกว่าจะเหลือ "รูปล้วน" หรือ "คลิปเดียว" — ไปลบส่วนเกินที่ 🖼️ จัดการสื่อ
  const mixed = (imgCount > 0 && videoCount > 0) || videoCount > 1;
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
  // ต้องขึ้นเมื่อมีวิดีโอด้วย — ไม่งั้นตะกร้าที่มีแต่คลิป (หรือคลิปเกิน 1) ไม่มีทางลบทิ้งทีละชิ้นเลย
  if (webUrl && imgCount + videoCount >= 1) {
    row1.push(
      new ButtonBuilder()
        .setLabel('🖼️ จัดการสื่อ')
        .setStyle(ButtonStyle.Link)
        .setURL(webUrl),
    );
  }
  const row2 = [];
  if (!empty) {
    row2.push(
      new ButtonBuilder()
        .setCustomId('basket_event_open')
        .setLabel('📅 สร้าง Event')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  row2.push(
    new ButtonBuilder()
      .setCustomId('basket_view_public')
      .setLabel('👁️ แสดงตะกร้า')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('basket_clear')
      .setLabel('🗑️ ล้าง')
      .setStyle(ButtonStyle.Secondary),
  );
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
    news:    { label: 'ห้องข่าวสาร', emoji: '📢' },
  };
  const order = ['fb', 'ig', 'threads', 'x', 'news'];
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
  const videoMsgIds = [...new Set(videos.map(r => r.message_id).filter(Boolean))];
  videoMsgIds.forEach((mid, i) => links.push(
    `[ดูวิดีโอต้นทาง${videoMsgIds.length > 1 ? ` ${i + 1}` : ''} 🎬](https://discord.com/channels/${guildId}/${channelId}/${mid})`
  ));

  // พรีวิว: **แนบไฟล์จากดิสก์** (ก้อน 4c) — ลิงก์ Discord หมดอายุ ~24 ชม. แล้วรูปในการ์ดจะหายเฉยๆ
  // ไฟล์ยังโหลดไม่เสร็จ (path NULL) → ตกไปใช้ลิงก์ต้นทางเหมือนเดิม
  const preview = images.length ? images[Math.floor(Math.random() * images.length)] : null;
  const files = [];
  let previewUrl = preview?.image_url || null;
  if (preview?.path) {
    try {
      const name = `preview.${storage.extOfPath(preview.path)}`;
      files.push(new AttachmentBuilder(await storage.readFile(preview.path), { name }));
      previewUrl = `attachment://${name}`;
    } catch (err) {
      console.error('[basket] อ่านรูปพรีวิวจากดิสก์ไม่ได้:', err.message);
    }
  }

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
  // ห้องข่าวสารผูกรายกลุ่ม (2026-08-12) — กลุ่มที่ไม่ได้ตั้งห้อง/ตั้งว่า 'off' จะไม่มีตัวเลือกนี้
  if (await getNewsChannelId(guildId, currentGroup, userId)) availablePlatforms.push('news');
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
        const p = await resolveWatermarkPath(resolved, guildId, currentGroup, userId);
        if (p && fs.existsSync(p)) defaultWmType = resolved;
      }
    } catch (err) {
      console.error('[basket] resolve default watermark:', err.message);
    }
  }
  const currentWmType = saved?.wmType ?? defaultWmType;

  const history = await getHistory(guildId, channelId);
  if (history.length) {
    // post_social_history เก็บ 1 แถว/แพลตฟอร์ม → getHistory GROUP BY batch_id มาให้แล้ว
    // (1 บรรทัด = 1 ครั้งที่กดโพสต์ เหมือนเดิม แต่ตอนนี้รู้ผลรายแพลตฟอร์ม)
    const platformIcon = { fb: '📘', ig: '📷', threads: '🧵', x: '𝕏', news: '📢' };
    const linkLabel    = { fb: 'FB', ig: 'IG', threads: '@', x: '𝕏', news: '📢' };
    const lines = history.map(h => {
      const plats = h.platforms || [];
      const icon  = plats.length > 1 ? '📲' : (platformIcon[plats[0]?.platform] || '📤');
      const grp   = h.group_name ? ` [${h.group_name}]` : '';
      const imgs  = h.image_count > 0 ? ` · ${h.image_count}` : (h.video_count > 0 ? ' · 🎬' : '');
      const links = plats.filter(p => p.url).map(p => `[${linkLabel[p.platform] || p.platform}](${p.url})`);
      const link  = links.length ? ` · ${links.join(' · ')}` : '';
      const fail  = plats.some(p => p.status !== 'done') ? ' ⚠️' : '';
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
      ? (isPersonal ? await getPersonalFiles(userId) : await getGroupWatermarkFiles(guildId, currentGroup))
      : await getOrgAllFiles(guildId);
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
  // ลิงก์ตรงไปหน้าโพสต์เลย ไม่ผ่าน /bot/media/basket (2026-08-08)
  // ตะกร้า 1 ใบ = โพสต์ 1 แถวใน post_episodes อยู่แล้ว (ก้อน 4c) → ทุกแถวใน basket ถือ episode_id มาให้
  // เหตุที่เลิก redirect: route เดิมสร้าง Location จาก req.url ซึ่งหลัง reverse proxy = origin ภายใน
  // (localhost:3000) → ปุ่มบนเซิร์ฟเวอร์จริงเด้งไป localhost · ลิงก์ตรงไม่มีปัญหานี้เพราะไม่ต้องเดา origin
  const episodeId = basket.find(r => r.episode_id)?.episode_id ?? null;
  const webUrl = process.env.WEB_BASE_URL && episodeId
    ? `${process.env.WEB_BASE_URL}/posts/${episodeId}`
    : null;
  components.push(...buildBasketButtons(imgCount, videoCount, !!caption, webUrl));

  return { embeds: [embed], components, files };
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
  const channelName = interaction.channel?.name || null;

  // หย่อนได้หมดก่อน แล้วค่อยไปลบส่วนเกินทีหลังที่ 🖼️ จัดการรูป (เหมือนรูป — เคาะ 2026-08-07)
  // เดิมตีตกทั้งข้อความเมื่อมีคลิป >1 ทำให้รูปในข้อความเดียวกันหล่นหายไปด้วย
  // ด่านกันของจริงอยู่ตอน "สร้างโพสต์" (handleBasketPost) ซึ่งเช็คทั้งผสมรูป+คลิป และคลิปเกิน 1
  if (images.length) await addImages(guildId, channelId, addedBy, images.map(a => ({ url: a.url })), msg.id, channelName);
  if (videos.length) await addVideo(guildId, channelId, addedBy, videos.map(a => ({ url: a.url })), msg.id, channelName);
  if (text && !images.length && !videos.length) await appendCaption(guildId, channelId, addedBy, text, msg.id, channelName);

  const basket = await getBasket(guildId, channelId);
  const added = [
    images.length ? `🖼️ ${images.length} รูป` : null,
    videos.length ? `🎬 ${videos.length} วิดีโอ` : null,
    text && !images.length && !videos.length ? `📝 caption (ต่อท้าย)` : null,
  ].filter(Boolean).join(' + ');

  const payload = await buildBasketPayload(basket, guildId, channelId, interaction.user.id, interaction.channel?.name);
  await interaction.editReply({ content: `✅ เพิ่ม ${added} แล้ว`, ...payload });

  // โหลดไฟล์ลงดิสก์ **หลัง ack เท่านั้น** — คลิป 10–50 MB ให้ interaction รอไม่ได้ (3 วิ ก็ตายแล้ว)
  // ปิดบั๊กรูปตายใน 24 ชม. + ข้อความต้นทางถูกลบก็ยังโพสต์ได้
  queueDownload(interaction.client, guildId, channelId);
}

/** โหลดสื่อของตะกร้าลงดิสก์แบบ fire-and-forget — ล้มก็ยังโพสต์ได้ด้วย source_url */
function queueDownload(client, guildId, channelId) {
  (async () => {
    const ep = await getOpenEpisode(guildId, channelId);
    if (!ep) return;
    await downloadPending(ep.id, { refreshUrls: urls => refreshAttachmentUrls(client, urls) });
  })().catch(err => console.error('[basket] โหลดสื่อลงดิสก์ล้ม:', err.message));
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
  if (await getNewsChannelId(guildId, group, userId)) availablePlatforms.push('news');
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
    return interaction.reply({ content: '❌ ตะกร้ามีทั้งรูปและวิดีโอ — ลบออกให้เหลือประเภทเดียวก่อน\nกด 🖼️ จัดการสื่อ หรือ 🗑️ ล้าง', flags: MessageFlags.Ephemeral });
  }
  // โพสต์ได้ครั้งละ 1 คลิป (ท่อโพสต์ส่ง videoItems[0] ตัวเดียว) — หย่อนหลายคลิปได้ แต่ต้องมาเหลือใบเดียวก่อนโพสต์
  if (basket.filter(r => r.type === 'video').length > 1) {
    return interaction.reply({ content: '❌ ตะกร้ามีวิดีโอมากกว่า 1 คลิป — โพสต์ได้ครั้งละคลิปเดียว\nกด 🖼️ จัดการสื่อ เพื่อลบคลิปที่ไม่เอาออก', flags: MessageFlags.Ephemeral });
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

// default วันเวลาเริ่ม event = ตอนนี้ +24 ชม. (เวลาเดิม วันถัดไป) ให้แก้ง่ายๆ
function defaultEventStartTime() {
  const thaiPlus24 = new Date(Date.now() + 31 * 60 * 60 * 1000); // +24h ชดเชย offset +7
  const d  = String(thaiPlus24.getUTCDate()).padStart(2, '0');
  const m  = String(thaiPlus24.getUTCMonth() + 1).padStart(2, '0');
  const h  = String(thaiPlus24.getUTCHours()).padStart(2, '0');
  const mi = String(thaiPlus24.getUTCMinutes()).padStart(2, '0');
  return `${d}/${m}/${thaiPlus24.getUTCFullYear()} ${h}:${mi}`;
}

const PLATFORM_LABEL = { fb: 'Facebook', ig: 'Instagram', threads: '@ Threads', x: 'X' };
const PLATFORM_SHORT = { fb: 'FB', ig: 'IG', threads: '@', x: 'X', news: 'ข่าวสาร' };

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

// unix seconds → "16/05/2026 15:00" เวลาไทย (สำหรับแปะท้าย backlink ตอนตั้งเวลา)
function formatScheduleThai(unixSec) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(unixSec * 1000));
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
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
// ลำดับยิงของเดิม — รูปเริ่มที่ FB, วิดีโอเริ่มที่ IG (IG ช้าสุด ยิงก่อนจะได้เห็นผลเร็ว)
const ORDER_IMAGE = ['fb', 'ig', 'threads', 'x', 'news'];
const ORDER_VIDEO = ['ig', 'fb', 'threads', 'x', 'news'];
const sortPlatforms = (platforms, order) => order.filter(p => platforms.includes(p));

// แปลงผลจาก pipeline เป็นบรรทัดข้อความของ Discord (หน้าที่เดียวที่เหลือของ handler คือ "พูด")
function formatResultLine(r, { isVideo, scheduleTime }) {
  const reels = isVideo && ['fb', 'ig', 'threads'].includes(r.platform) ? ' Reels' : '';
  if (!r.ok) return `❌ ${r.label}${reels}: ${r.error}`;
  const link  = r.url ? ` · 🔗 [ดูโพสต์](${r.url})` : '';
  const sched = r.platform === 'fb' && scheduleTime ? ` (⏰ ตั้งเวลา ${formatScheduleThai(scheduleTime)} น.)` : '';
  return `✅ ${r.label}${reels}${link}${sched}`;
}

// ตะกร้า → ท่อกลาง `services/publishPipeline.js` (กติกาข้อ 16: logic การโพสต์อยู่ที่นั่นที่เดียว)
// ที่นี่เหลือแค่: อ่านตะกร้า → เตรียม input → เรียกท่อ → format ข้อความตอบใน Discord
async function processAndPost(interaction, state) {
  const basket     = await getBasket(state.guildId, state.channelId);
  const imageItems = basket.filter(r => r.type === 'image');
  const videoItems = basket.filter(r => r.type === 'video');
  const isVideo    = videoItems.length > 0;

  if (isVideo && imageItems.length > 0) {
    return interaction.editReply({ content: '❌ ตะกร้ามีทั้งรูปและวิดีโอ — ล้างแล้วโพสต์ทีละประเภท' });
  }

  // path (ไฟล์บนดิสก์) → buffer · ไม่มีไฟล์ → ลิงก์ Discord ที่รีเฟรชแล้ว · วิดีโอ → URL สาธารณะ
  // ตัวแปลงอยู่ในท่อกลางตัวเดียวกับ worker (กติกาข้อ 16) — ที่นี่แค่ผูก client ให้มันรีเฟรชลิงก์ได้
  const { images: sources, videoUrl, videoPath } = await loadMediaSources(
    [...imageItems, ...videoItems].map(it => ({
      kind: it.type === 'video' ? 'video' : 'image', path: it.path, url: it.image_url,
    })),
    { refreshUrls: urls => refreshAttachmentUrls(interaction.client, urls) }
  );

  const { scheduleTime } = state;
  const platforms = sortPlatforms(state.platforms || [], isVideo ? ORDER_VIDEO : ORDER_IMAGE);
  const onProgress = msg => { interaction.editReply({ content: msg }).catch(() => {}); };

  // เตรียมรูป (วิดีโอส่ง URL ให้ Meta ไปดึงเอง ไม่ต้องเตรียม)
  let processed = [], wmErrors = [];
  if (!isVideo && imageItems.length > 0) {
    const watermarkPath = state.wmType !== 'none'
      ? await resolveWatermarkPath(state.wmType, state.guildId, state.group, state.userId)
      : null;
    if (watermarkPath) await interaction.editReply({ content: `⏳ ติดลายน้ำ 0/${imageItems.length} รูป...` });
    else               await interaction.editReply({ content: '⏳ กำลังเตรียมรูป...' });

    ({ processed, errors: wmErrors } = await prepareImages(sources, { watermarkPath, onProgress }));
    if (!processed.length) {
      const head = watermarkPath ? '❌ ติดลายน้ำไม่สำเร็จ' : '❌ ดาวน์โหลดรูปไม่สำเร็จ';
      return interaction.editReply({ content: `${head}\n${wmErrors.map(e => `❌ ${e}`).join('\n')}` });
    }
  }

  // บริบทสำหรับเขียนประวัติ — ท่อกลางเป็นคนเขียนลง post_social_history (1 แถว/แพลตฟอร์ม)
  const [orgId, createdBy] = await Promise.all([
    orgIdOfGuild(state.guildId).catch(() => null),
    userIdByDiscord(interaction.user.id).catch(() => null),
  ]);
  // snapshot ของสื่อ ณ ตอนกดโพสต์ — เก็บทั้ง path และ url เพื่อให้ "กดลองใหม่" ทีหลังยังหาไฟล์เจอ
  const snapOf = it => ({ kind: it.type === 'video' ? 'video' : 'image', path: it.path || null, url: it.image_url || null });
  const mediaSnapshot = isVideo ? [snapOf(videoItems[0])] : imageItems.map(snapOf);

  const { results, status } = await publishBatch({
    platforms,
    guildId: state.guildId,
    userDiscordId: interaction.user.id,
    images: processed,
    videoUrl: isVideo ? videoUrl : null,
    videoPath: isVideo ? videoPath : null,   // ห้องข่าว Discord แนบไฟล์ตรงถ้ายังมีต้นฉบับบนดิสก์
    caption: state.caption,
    scheduleTime: isVideo ? scheduleTime : scheduleTime,
    group: state.group,
    client: interaction.client,
    onProgress,
    recordTo: {
      orgId, episodeId: basket[0]?.episode_id || null,
      guildId: state.guildId, channelId: state.channelId,
      wmType: !isVideo && state.wmType !== 'none' ? state.wmType : null,
      media: mediaSnapshot,
      scheduledAt: !isVideo && state.scheduleTime ? new Date(state.scheduleTime * 1000) : null,
      groupName: state.group || null,
      createdBy, createdByDiscordId: interaction.user.id,
    },
  });

  const urlOf = p => results.find(r => r.platform === p && r.ok)?.url || null;
  const fbUrl = urlOf('fb'), igUrl = urlOf('ig'), threadsUrl = urlOf('threads'), xUrl = urlOf('x');

  // ลิงก์ที่ถูกย้ายออกจากเนื้อโพสต์ FB — บอทคอมเมนต์เองไม่ได้ ต้องให้คนแปะเอง
  // (ดู services/linkToComment.js · ตัดซ้ำเผื่อยิงหลายเพจจาก caption ก้อนเดียวกัน)
  const linkComments = [...new Set(results.filter(r => r.ok && r.linkComment).map(r => r.linkComment))];
  const linkCommentLines = linkComments.length
    ? ['⚠️ **ลิงก์ถูกย้ายออกจากเนื้อโพสต์แล้ว — ก๊อปไปแปะเป็นคอมเมนต์แรก**',
       ...linkComments.map(c => '```\n' + c + '\n```')]
    : [];


  if (isVideo) {
    await interaction.followUp({
      content: ['✅ โพสต์เสร็จแล้ว', ...results.map(r => formatResultLine(r, { isVideo, scheduleTime })), ...linkCommentLines].join('\n'),
    }).catch(() => {});
    return;
  }

  await setSetting(state.guildId, `last_post_${state.channelId}`, { fbUrl, postedAt: new Date() }).catch(() => {});
  await deleteSetting(state.guildId, `pending_ig_${state.channelId}`).catch(() => {});

  const total = imageItems.length;
  const lines = [
    '✅ โพสต์เสร็จแล้ว',
    state.wmType !== 'none' && total > 0 ? `✅ ติดลายน้ำ ${processed.length}/${total} รูป` : null,
    ...results.map(r => formatResultLine(r, { isVideo, scheduleTime })),
    ...(wmErrors.length ? [`⚠️ ${wmErrors.join(', ')}`] : []),
    ...linkCommentLines,
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

// ─── สร้าง Discord Event จากโพสต์ ────────────────────────────────────────────
async function handleBasketEventOpen(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({ content: '❌ ไม่มีสิทธิ์สร้าง Event', flags: MessageFlags.Ephemeral });
  }
  const basket = await getBasket(interaction.guildId, interaction.channelId);
  const caption = basket.find(r => r.type === 'caption')?.caption
    || pendingPost.get(interaction.user.id)?.caption || '';
  const defaultName = (caption.split('\n').map(s => s.trim()).find(Boolean) || '').slice(0, 100);

  // unique customId to bypass Discord client modal cache (forces fresh render)
  const cid = `basket_event_modal:${Date.now()}`;

  const nameInput = new TextInputBuilder()
    .setCustomId('event_name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100);
  if (defaultName) nameInput.setValue(defaultName);

  const startInput = new TextInputBuilder()
    .setCustomId('event_start').setStyle(TextInputStyle.Short).setRequired(true)
    .setMaxLength(20).setPlaceholder('เช่น 19/7 09:00')
    .setValue(defaultEventStartTime());

  const endInput = new TextInputBuilder()
    .setCustomId('event_end').setStyle(TextInputStyle.Short).setRequired(false)
    .setMaxLength(20).setPlaceholder('เว้นว่าง = เริ่ม +2 ชม.');

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('event_channel').setRequired(false)
    .setChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice);

  const locationInput = new TextInputBuilder()
    .setCustomId('event_location').setStyle(TextInputStyle.Short).setRequired(false)
    .setMaxLength(100).setPlaceholder('เช่น หน้าศาลากลางราชบุรี');

  const modal = new ModalBuilder().setCustomId(cid).setTitle('📅 สร้าง Event').addLabelComponents(
    new LabelBuilder().setLabel('ชื่อกิจกรรม').setTextInputComponent(nameInput),
    new LabelBuilder().setLabel('วันเวลาเริ่ม').setTextInputComponent(startInput),
    new LabelBuilder().setLabel('วันเวลาจบ').setTextInputComponent(endInput),
    new LabelBuilder().setLabel('จัดในห้องประชุม (เลือกอย่างใดอย่างหนึ่ง)').setChannelSelectMenuComponent(channelSelect),
    new LabelBuilder().setLabel('หรือสถานที่ข้างนอก').setTextInputComponent(locationInput),
  );
  return interaction.showModal(modal);
}

async function handleBasketEventModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const name     = interaction.fields.getTextInputValue('event_name').trim();
  const startStr = interaction.fields.getTextInputValue('event_start').trim();
  const endStr   = (interaction.fields.getTextInputValue('event_end') || '').trim();
  const location = (interaction.fields.getTextInputValue('event_location') || '').trim();
  const channelId = interaction.fields.getSelectedChannels('event_channel', false)?.first()?.id || null;

  const start = parseThaiDateTime(startStr);
  if (!start || isNaN(start.getTime())) {
    return interaction.editReply({ content: '❌ รูปแบบวันเวลาเริ่มไม่ถูกต้อง — ใช้เช่น 19/7 09:00' });
  }
  if (start.getTime() < Date.now() + 5 * 60 * 1000) {
    return interaction.editReply({ content: '❌ เวลาเริ่มต้องเป็นอนาคต (อย่างน้อย 5 นาทีจากนี้)' });
  }
  let end = null;
  if (endStr) {
    end = parseThaiDateTime(endStr);
    if (!end || isNaN(end.getTime())) return interaction.editReply({ content: '❌ รูปแบบวันเวลาจบไม่ถูกต้อง' });
    if (end <= start) return interaction.editReply({ content: '❌ เวลาจบต้องอยู่หลังเวลาเริ่ม' });
  } else {
    end = new Date(start.getTime() + 2 * 3600 * 1000);
  }
  if (!channelId && !location) {
    return interaction.editReply({ content: '❌ เลือกห้องประชุม หรือพิมพ์สถานที่ข้างนอก อย่างใดอย่างหนึ่ง' });
  }

  const basket  = await getBasket(interaction.guildId, interaction.channelId);
  const caption = basket.find(r => r.type === 'caption')?.caption
    || pendingPost.get(interaction.user.id)?.caption || '';

  // รูปปกจากรูปแรกในตะกร้า — ไฟล์บนดิสก์ก่อน · ไม่มีค่อยรีเฟรชลิงก์ · ไม่ได้จริงๆ = สร้างแบบไม่มีปก
  let image;
  const firstImage = basket.find(r => r.type === 'image');
  if (firstImage?.path) {
    try { image = await storage.readFile(firstImage.path); } catch { image = undefined; }
  }
  if (!image && firstImage?.image_url) {
    const [url] = await refreshUrlList(interaction.client, [firstImage.image_url]);
    try { image = await fetchBuffer(url); } catch { image = undefined; }
  }

  await interaction.editReply({ content: '📅 กำลังสร้าง Event...' }).catch(() => {});

  const selectedChannel = channelId ? interaction.guild.channels.cache.get(channelId) : null;
  const isStage = selectedChannel?.type === ChannelType.GuildStageVoice;
  let event;
  try {
    event = await interaction.guild.scheduledEvents.create({
      name,
      scheduledStartTime: start,
      scheduledEndTime: end,
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: channelId
        ? (isStage ? GuildScheduledEventEntityType.StageInstance : GuildScheduledEventEntityType.Voice)
        : GuildScheduledEventEntityType.External,
      ...(channelId ? { channel: channelId } : { entityMetadata: { location } }),
      description: caption ? caption.slice(0, 1000) : undefined,
      image,
      reason: `สร้างจากตะกร้าสื่อโดย ${interaction.user.tag}`,
    });
  } catch (err) {
    return interaction.editReply({ content: `❌ สร้าง Event ไม่สำเร็จ: ${err.message}` });
  }

  const eventUrl = `https://discord.com/events/${interaction.guildId}/${event.id}`;
  const announcement = buildEventAnnouncement({
    name,
    startUnix: Math.floor(start.getTime() / 1000),
    locationText: channelId ? `<#${channelId}>` : location,
    eventUrl,
  });

  let announceLine;
  try {
    const res = await sendOrQueueAnnouncement(interaction.guild, announcement);
    if (res.skipped)      announceLine = 'ℹ️ ยังไม่ได้ตั้งค่าห้องข่าวสาร — ข้ามการประกาศ';
    else if (res.queued)  announceLine = `⏰ ช่วงนี้เป็นเวลาพัก — ประกาศ @everyone จะส่งเข้าห้องข่าวสาร <t:${res.releaseUnix}:f> น.`;
    else                  announceLine = '📣 ส่งประกาศพร้อม @everyone เข้าห้องข่าวสารแล้ว';
  } catch (err) {
    announceLine = `⚠️ ส่งประกาศไม่สำเร็จ: ${err.message}`;
  }

  return interaction.editReply({ content: `✅ สร้าง Event "${name}" แล้ว\n${eventUrl}\n${announceLine}` });
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
  handleBasketEventOpen,
  handleBasketEventModal,
  buildBasketPayload,
  stripDiscordMarkdown,
};
