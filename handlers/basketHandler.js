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
const { addImages, setCaption, getBasket, clearBasket } = require('../db/mediaBasket');
const { fetchBuffer, applyWatermark } = require('../utils/watermarkImage');
const { postToFacebook, postToInstagram, getConfig } = require('../services/metaApi');

const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'watermark');
const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const pendingPost = new Map(); // userId → { guildId, channelId, caption, wmType, platform }

function getWatermarkFiles() {
  try {
    return fs.readdirSync(ASSETS_DIR).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
  } catch { return []; }
}

function stripExt(f) {
  return f.replace(/\.[^.]+$/, '').replace(/^\d+-/, '');
}

function buildBasketEmbed(imgCount, caption, firstImageUrl = null) {
  const embed = new EmbedBuilder()
    .setColor(0xff6a13)
    .setTitle(`🧺 Basket — ${imgCount} รูป`);
  if (caption) embed.setDescription(caption);
  else embed.setDescription('*ยังไม่มี caption*');
  if (firstImageUrl) embed.setImage(firstImageUrl);
  return embed;
}

function buildBasketButtons(imgCount) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('basket_view')
      .setLabel(`🧺 ดู Basket (${imgCount} รูป)`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('basket_post')
      .setLabel('📤 โพสต์เลย')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(imgCount === 0),
    new ButtonBuilder()
      .setCustomId('basket_clear')
      .setLabel('🗑️ ล้าง')
      .setStyle(ButtonStyle.Danger),
  );
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
    return interaction.reply({
      content: '❌ ข้อความนี้ไม่มีรูปหรือข้อความ',
      flags: MessageFlags.Ephemeral,
    });
  }

  const { guildId, channelId } = interaction;
  const addedBy = interaction.user.id;
  const isBot = msg.author?.bot ?? false;

  if (images.length) await addImages(guildId, channelId, addedBy, images.map(a => ({ url: a.url })), msg.id);
  if (text && !isBot) await setCaption(guildId, channelId, addedBy, text, msg.id);

  const basket  = await getBasket(guildId, channelId);
  const imgCount = basket.filter(r => r.type === 'image').length;
  const hasCaption = basket.some(r => r.type === 'caption');

  const added = [
    images.length ? `🖼️ ${images.length} รูป` : null,
    text && !isBot ? `📝 caption (แทนอันเก่า)` : null,
  ].filter(Boolean).join(' + ');

  const caption = basket.find(r => r.type === 'caption')?.caption || null;
  const firstImageUrl = basket.find(r => r.type === 'image')?.image_url || null;
  const embed = buildBasketEmbed(imgCount, caption, firstImageUrl);

  await interaction.reply({
    content: `✅ เพิ่ม ${added} แล้ว`,
    embeds: [embed],
    components: [buildBasketButtons(imgCount)],
    flags: MessageFlags.Ephemeral,
  });
}

// ─── View basket ──────────────────────────────────────────────────────────────
async function handleBasketView(interaction) {
  const basket = await getBasket(interaction.guildId, interaction.channelId);

  if (!basket.length) {
    return interaction.reply({ content: '🧺 ตะกร้าว่างเปล่า', flags: MessageFlags.Ephemeral });
  }

  const images  = basket.filter(r => r.type === 'image');
  const caption = basket.find(r => r.type === 'caption')?.caption || null;
  const firstImageUrl = images[0]?.image_url || null;
  const embed   = buildBasketEmbed(images.length, caption, firstImageUrl);

  await interaction.reply({
    embeds: [embed],
    components: [buildBasketButtons(images.length)],
    flags: MessageFlags.Ephemeral,
  });
}

// ─── Clear basket ─────────────────────────────────────────────────────────────
async function handleBasketClear(interaction) {
  await clearBasket(interaction.guildId, interaction.channelId);
  await interaction.reply({ content: '🗑️ ล้าง Basket แล้ว', flags: MessageFlags.Ephemeral });
}

// ─── Post: open modal ─────────────────────────────────────────────────────────
async function handleBasketPost(interaction) {
  const basket = await getBasket(interaction.guildId, interaction.channelId);

  if (!basket.length) {
    return interaction.reply({ content: '❌ Basket ว่างเปล่า', flags: MessageFlags.Ephemeral });
  }

  const existingCaption = basket.filter(r => r.type === 'caption').map(r => r.caption).join('\n');

  const modal = new ModalBuilder().setCustomId('basket_post_modal').setTitle('โพสต์ลง Social');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('basket_caption')
        .setLabel('Caption (เว้นว่างได้)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(existingCaption)
        .setRequired(false)
        .setMaxLength(2200)
    )
  );
  return interaction.showModal(modal);
}

// ─── Post modal submit: show watermark + platform selection ───────────────────
async function handleBasketPostModal(interaction) {
  const caption  = interaction.fields.getTextInputValue('basket_caption').trim();
  const basket   = await getBasket(interaction.guildId, interaction.channelId);
  const hasImages = basket.some(r => r.type === 'image');

  pendingPost.set(interaction.user.id, {
    guildId:   interaction.guildId,
    channelId: interaction.channelId,
    caption,
    wmType:    hasImages ? null : 'none',
    platform:  hasImages ? 'both' : 'fb',
  });

  // caption-only → ไม่ต้องเลือก watermark, force Facebook
  if (!hasImages) {
    await interaction.reply({
      content: '⚙️ ไม่มีรูป — จะโพสต์ caption ลง Facebook อย่างเดียว\nกด ✅ เพื่อยืนยัน',
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('basket_confirm')
            .setLabel('✅ โพสต์')
            .setStyle(ButtonStyle.Primary)
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const files = getWatermarkFiles();
  if (!files.length) {
    return interaction.reply({ content: '❌ ไม่มีไฟล์ลายน้ำใน assets/watermark/', flags: MessageFlags.Ephemeral });
  }

  const cfg = await getConfig(interaction.guildId);
  const platformOptions = [
    new StringSelectMenuOptionBuilder().setLabel('FB + IG').setValue('both').setEmoji('📲'),
    new StringSelectMenuOptionBuilder().setLabel('Facebook เท่านั้น').setValue('fb').setEmoji('📘'),
  ];
  if (cfg?.igId) {
    platformOptions.push(
      new StringSelectMenuOptionBuilder().setLabel('Instagram เท่านั้น').setValue('ig').setEmoji('📷')
    );
  }

  await interaction.reply({
    content: '⚙️ เลือกการตั้งค่าแล้วกด ✅',
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('basket_wm_type')
          .setPlaceholder('เลือกแบบลายน้ำ')
          .addOptions(files.map(f =>
            new StringSelectMenuOptionBuilder().setLabel(stripExt(f)).setValue(f)
          ))
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('basket_platform')
          .setPlaceholder('โพสต์ที่ไหน (default: FB + IG)')
          .addOptions(platformOptions)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('basket_confirm')
          .setLabel('✅ โพสต์')
          .setStyle(ButtonStyle.Primary)
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

// ─── Select menus ─────────────────────────────────────────────────────────────
async function handleBasketSelect(interaction) {
  const state = pendingPost.get(interaction.user.id);
  if (!state) return interaction.deferUpdate();
  if (interaction.customId === 'basket_wm_type') state.wmType   = interaction.values[0];
  if (interaction.customId === 'basket_platform') state.platform = interaction.values[0];
  await interaction.deferUpdate();
}

// ─── Confirm: watermark + post ────────────────────────────────────────────────
async function handleBasketConfirm(interaction) {
  const state = pendingPost.get(interaction.user.id);
  if (!state) return interaction.reply({ content: '❌ Session หมดอายุ', flags: MessageFlags.Ephemeral });
  if (!state.wmType) return interaction.reply({ content: '❌ กรุณาเลือกแบบลายน้ำก่อน', flags: MessageFlags.Ephemeral });

  pendingPost.delete(interaction.user.id);
  await interaction.deferUpdate();

  const basket     = await getBasket(state.guildId, state.channelId);
  const imageItems = basket.filter(r => r.type === 'image');
  const processed  = [];
  const wmErrors   = [];

  if (state.wmType !== 'none') {
    const total = imageItems.length;
    await interaction.editReply({ content: `⏳ ติดลายน้ำ 0/${total} รูป...`, components: [] });

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
    await interaction.editReply({ content: `📤 กำลังโพสต์...`, components: [] });
  }

  await interaction.editReply({ content: `📤 กำลังโพสต์...` });

  const results = [];
  if (state.platform === 'fb' || state.platform === 'both') {
    try {
      await postToFacebook(state.guildId, processed, state.caption);
      results.push('✅ Facebook');
    } catch (err) {
      results.push(`❌ Facebook: ${err.message} (guild: ${state.guildId})`);
    }
  }
  if (state.platform === 'ig' || state.platform === 'both') {
    try {
      await postToInstagram(state.guildId, processed, state.caption);
      results.push('✅ Instagram');
    } catch (err) {
      results.push(`❌ Instagram: ${err.message} (guild: ${state.guildId})`);
    }
  }

  await clearBasket(state.guildId, state.channelId);

  const summary = [
    `📊 ติดลายน้ำ ${processed.length}/${total} รูป`,
    ...results,
    ...(wmErrors.length ? [`⚠️ ${wmErrors.join(', ')}`] : []),
  ].join('\n');

  interaction.editReply({ content: summary }).catch(() => {});
}

module.exports = {
  handleBasketAdd,
  handleBasketView,
  handleBasketClear,
  handleBasketPost,
  handleBasketPostModal,
  handleBasketSelect,
  handleBasketConfirm,
};
