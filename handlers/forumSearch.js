// handlers/forumSearch.js
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { hybridSearch } = require('../services/forumIndexer');

const ITEMS_PER_PAGE = 10;

// ─── Embed builder ───────────────────────────────────────────────────────────

function buildSearchResultEmbed(slice, { keyword, page, totalPages, channelId, sort }) {
  const sortLabel = { relevant: 'เกี่ยวข้องมากสุด', newest: 'ล่าสุด', oldest: 'เก่าสุด' }[sort] ?? sort;
  const title     = keyword ? `🔍 ผลค้นหา "${keyword}"` : `📋 โพสต์ทั้งหมด (${sortLabel})`;

  const lines = slice.length
    ? slice.map((p, i) => {
        const num  = (page - 1) * ITEMS_PER_PAGE + i + 1;
        const name = p.post_name ?? '(ไม่ทราบชื่อ)';
        return p.post_url ? `\`${num}\` [${name}](${p.post_url})` : `\`${num}\` ${name}`;
      }).join('\n')
    : '_ไม่พบโพสต์ที่ตรงกับคำค้นหา_';

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(title)
    .setDescription(lines)
    .setFooter({ text: `หน้า ${page} / ${totalPages}${channelId ? '' : ' • ค้นทุกช่อง'}` });
}

function buildSearchComponents({ keyword, channelId, sort, page, totalPages }) {
  const ch   = channelId ?? 'all';
  const kw   = encodeURIComponent(keyword.slice(0, 20));
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`forum_result_${kw}_${ch}_${sort}_${page - 1}`)
        .setLabel('◀ ก่อนหน้า')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId(`forum_result_${kw}_${ch}_${sort}_${page + 1}`)
        .setLabel('ถัดไป ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages),
    ),
  ];
}

// ─── Handle ปุ่ม "ค้นหาโพสต์" (forum_search) → เปิด modal ───────────────────

async function handleOpenSearch(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('forum_search_modal')
    .setTitle('ค้นหาโพสต์');

  const keywordInput = new TextInputBuilder()
    .setCustomId('forum_keyword')
    .setLabel('คำค้นหา')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('เช่น น้ำท่วม, ไฟฟ้า...')
    .setRequired(true)
    .setMaxLength(100);

  modal.addComponents(
    new ActionRowBuilder().addComponents(keywordInput),
  );

  await interaction.showModal(modal);
}

// ─── Handle modal submit (forum_search_modal) ────────────────────────────────

async function handleSearchModal(interaction) {
  const keyword = interaction.fields.getTextInputValue('forum_keyword').trim();
  await interaction.deferReply({ ephemeral: true });

  const channelId = null; // ค้นทุกช่อง — ถ้าอยากเจาะช่องให้ใช้ /forum search channel:

  const sort    = 'relevant';
  const results = await hybridSearch(keyword, { guildId: interaction.guildId, channelId });
  const page    = 1;
  const totalPages = Math.max(1, Math.ceil(results.length / ITEMS_PER_PAGE));
  const slice   = results.slice(0, ITEMS_PER_PAGE);

  const embed      = buildSearchResultEmbed(slice, { keyword, page, totalPages, channelId, sort });
  const components = buildSearchComponents({ keyword, channelId, sort, page, totalPages });

  return interaction.editReply({ embeds: [embed], components });
}

// ─── Handle pagination (forum_result_{kw}_{ch}_{sort}_{page}) ───────────────

async function handleResultPage(interaction) {
  // customId: forum_result_{kw}_{ch}_{sort}_{page}
  const parts     = interaction.customId.split('_');
  // forum result {kw} {ch} {sort} {page}
  // index: 0     1      2    3     4       5
  const page      = parseInt(parts.at(-1));
  const sort      = parts.at(-2);
  const ch        = parts.at(-3);
  const kw        = parts.slice(2, -3).join('_');
  const keyword   = decodeURIComponent(kw);
  const channelId = ch === 'all' ? null : ch;

  await interaction.deferUpdate();

  let results = await hybridSearch(keyword, { guildId: interaction.guildId, channelId });

  if (sort === 'newest') {
    results.sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0));
  } else if (sort === 'oldest') {
    results.sort((a, b) => new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0));
  }

  const totalPages = Math.max(1, Math.ceil(results.length / ITEMS_PER_PAGE));
  const safePage   = Math.min(Math.max(1, page), totalPages);
  const slice      = results.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const embed      = buildSearchResultEmbed(slice, { keyword, page: safePage, totalPages, channelId, sort });
  const components = buildSearchComponents({ keyword, channelId, sort, page: safePage, totalPages });

  return interaction.editReply({ embeds: [embed], components });
}

module.exports = {
  buildSearchResultEmbed,
  buildSearchComponents,
  handleOpenSearch,
  handleSearchModal,
  handleResultPage,
};
