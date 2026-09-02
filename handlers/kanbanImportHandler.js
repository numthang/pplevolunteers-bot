// handlers/kanbanImportHandler.js — คลิกขวาข้อความ → สร้างเป็น "การบ้าน"
//
// ต่างจาก postImportHandler/caseImportHandler 2 อย่างที่ตั้งใจ:
//   1. **ใช้ได้กับข้อความไหนก็ได้ ไม่ต้องอยู่ในกระทู้** — งานส่วนใหญ่ถูกสั่งกลางห้องแชท
//      ถ้าบังคับให้อยู่ในกระทู้ ก็ไม่ได้แก้ปัญหา "สั่งงานปากเปล่าแล้วไหลหาย" ซึ่งเป็นเหตุผลที่โมดูลนี้เกิด
//   2. **ไม่เรียก AI** — งานชิ้นเดียวไม่ต้องกลั่น เอาข้อความมาตั้งเป็นชื่อแล้วให้คนแก้ในกล่องเลย
//      (เร็วกว่า + ไม่เผาโควตา AI กับงานที่คนพิมพ์เองได้ใน 3 วินาที)
const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags,
} = require('discord.js');
const { getT } = require('../services/i18n');
const { createCardFromDiscord, cardWebUrl } = require('../db/kanbanCards');

const TITLE_MAX = 200;   // ตรงกับ kanban_cards.title VARCHAR(200)
const DETAIL_MAX = 4000; // เพดานจริงของ Discord modal Paragraph input (detail column เป็น TEXT ไม่จำกัดอยู่แล้ว)

/** ข้อความดิบ → ชื่อการบ้านตั้งต้น (บรรทัดแรกที่มีเนื้อ ตัดให้พอดีช่อง) */
function toTitle(raw) {
  const line = String(raw || '')
    .split('\n')
    .map(s => s.trim())
    .find(s => s.length > 0) || '';
  // ตัด mention/emoji custom ออกจากหัวเรื่อง — <@123> / <:name:456> อ่านไม่รู้เรื่องในรายการงาน
  const clean = line.replace(/<a?:\w+:\d+>/g, '').replace(/<@[!&]?\d+>/g, '').replace(/\s+/g, ' ').trim();
  return clean.slice(0, TITLE_MAX);
}

/** เปิด modal pre-fill จากข้อความที่คลิกขวา */
async function handleKanbanImportStart(interaction) {
  const t = await getT(interaction.guildId);
  const msg = interaction.targetMessage;

  const raw = msg?.content || '';
  const title = toTitle(raw);
  if (!title) {
    return interaction.reply({ content: t('kanban.import.noText'), flags: MessageFlags.Ephemeral });
  }

  // channelId+msg.id ใน customId — ประกอบ source_url ตอน submit ไม่ได้ เพราะ modal submit
  // เป็น interaction คนละก้อน ตัวแปร msg ของ scope นี้หายไปแล้ว (เก็บ URL เต็มไม่ได้ ยาวเกิน customId limit 100 ตัวอักษร)
  // timestamp ท้ายสุด — Discord cache modal ตาม customId ถ้าซ้ำจะได้ค่า pre-fill เก่า
  const modal = new ModalBuilder()
    .setCustomId(`kanban_card_modal:${msg.channelId}:${msg.id}:${Date.now()}`)
    .setTitle(t('kanban.import.modalTitle'));

  const titleInput = new TextInputBuilder()
    .setCustomId('title').setLabel(t('kanban.import.titleLabel'))
    .setStyle(TextInputStyle.Short).setMaxLength(TITLE_MAX)
    .setValue(title).setRequired(true);

  const detailInput = new TextInputBuilder()
    .setCustomId('detail').setLabel(t('kanban.import.detailLabel'))
    .setStyle(TextInputStyle.Paragraph).setMaxLength(DETAIL_MAX)
    // ใส่ข้อความเต็มไว้ให้เฉพาะตอนที่ยาวกว่าหัวเรื่อง ไม่งั้นซ้ำกันเปล่าๆ
    .setValue(raw.trim().length > title.length ? raw.trim().slice(0, DETAIL_MAX) : '')
    .setRequired(false);

  const dueInput = new TextInputBuilder()
    .setCustomId('due').setLabel(t('kanban.import.dueLabel'))
    .setPlaceholder(t('kanban.import.duePlaceholder'))
    .setStyle(TextInputStyle.Short).setMaxLength(16).setRequired(false);

  const ownerInput = new TextInputBuilder()
    .setCustomId('mine').setLabel(t('kanban.import.mineLabel'))
    .setPlaceholder(t('kanban.import.minePlaceholder'))
    .setStyle(TextInputStyle.Short).setMaxLength(3).setValue('ใช่').setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(detailInput),
    new ActionRowBuilder().addComponents(dueInput),
    new ActionRowBuilder().addComponents(ownerInput),
  );
  await interaction.showModal(modal);
}

/**
 * "2026-08-20 17:00" / "2026-08-20" → string ที่ pg รับได้ตรงๆ (local Thai time)
 * ⚠️ ห้ามแปลงผ่าน new Date().toISOString() — Node ทำงานใน UTC จะ +7 ทุกครั้ง
 * คืน undefined = รูปแบบผิด (ให้ผู้ใช้รู้) · คืน null = ไม่ได้กรอก
 */
function parseDue(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
  if (!m) return undefined;
  const [, y, mo, d, hh, mm] = m;
  return `${y}-${mo}-${d} ${hh || '00'}:${mm || '00'}:00`;
}

/** submit modal → เขียนการบ้าน + ตอบกลับแบบเห็นคนเดียว */
async function handleKanbanImportModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const t = await getT(interaction.guildId);

  // customId: kanban_card_modal:<channelId>:<messageId>:<timestamp>
  const [, channelId, sourceMessageId] = interaction.customId.split(':');
  const sourceUrl = channelId && sourceMessageId
    ? `https://discord.com/channels/${interaction.guildId}/${channelId}/${sourceMessageId}`
    : null;

  const title = interaction.fields.getTextInputValue('title').trim();
  const detail = interaction.fields.getTextInputValue('detail').trim() || null;
  const dueRaw = interaction.fields.getTextInputValue('due');
  const mineRaw = interaction.fields.getTextInputValue('mine').trim().toLowerCase();

  if (!title) return interaction.editReply({ content: t('kanban.import.needTitle') });

  const dueAt = parseDue(dueRaw);
  if (dueAt === undefined) return interaction.editReply({ content: t('kanban.import.badDue') });

  // ตอบว่า "ไม่/no" เท่านั้นถึงจะไม่รับเป็นเจ้าภาพ — เว้นว่าง = รับ (เคสปกติที่สุด)
  const assignToSelf = !['ไม่', 'ไม่ใช่', 'no', 'n'].includes(mineRaw);

  try {
    const card = await createCardFromDiscord({
      guildId: interaction.guildId,
      actorDiscordId: interaction.user.id,
      actorProfile: { username: interaction.user.username },
      title, detail, dueAt, assignToSelf,
      sourceUrl, sourceMessageId,
    });

    // ⚠️ คู่แฝดของ formatRef() ใน web/lib/kanbanAccess.js — **แก้ที่นั่นต้องแก้ที่นี่ด้วยเสมอ**
    //    require() ตัวจริงไม่ได้: ไฟล์นั้นเป็น ESM และลาก roleAccess.js ตามมา (บอทเป็น CJS)
    const ref = `KB-${card.ref_no}`;
    const url = await cardWebUrl(interaction.guildId, card.ref_no);
    // ⭐ ทำ "รหัส" ให้เป็นลิงก์ในตัว ไม่แปะ URL เปล่าอีกบรรทัด — ทรงเดียวกับ caseImportHandler
    //    (ยังไม่ตั้ง web_base_url → ตกไปเป็นตัวหนา ข้อความไม่พังและยังอ่านรู้เรื่อง)
    const refLabel = url ? `[${ref}](${url})` : `**${ref}**`;

    await interaction.editReply({
      content: t(assignToSelf ? 'kanban.import.createdMine' : 'kanban.import.createdPool', {
        ref: refLabel, title: card.title,
      }),
      flags: MessageFlags.SuppressEmbeds,
    });

    /**
     * ประกาศให้ทั้งห้องเห็น — **ตอบกลับข้อความต้นทาง** ไม่ใช่เปลี่ยน interaction เป็น public
     * (user สั่ง 2026-08-28 · แนวเดียวกับ postImportHandler ที่ยิง thread.send() หลัง ack)
     *
     * ⭐ ทำไมเป็น reply ของข้อความเดิม ไม่ใช่ thread.send() แบบ posts/cases:
     *    โมดูลนี้ตั้งใจให้ใช้กับ **ข้อความไหนก็ได้ ไม่ต้องอยู่ในกระทู้** (ดูหัวไฟล์) → ไม่มี thread ให้ส่ง
     *    reply ผูกกับข้อความต้นทางเลยดีกว่า: คนที่สั่งงานเห็นทันทีว่างานถูกรับไปแล้ว ไม่ไหลหาย
     *
     * ⚠️ `failIfNotExists: false` — ข้อความต้นทางอาจถูกลบระหว่างที่กรอก modal อยู่
     *    ไม่มีตัวนี้ = ทั้งก้อน throw แล้วประกาศไม่ออกเลย (มีตัวนี้จะกลายเป็นข้อความธรรมดาในห้องแทน)
     * ⚠️ `allowedMentions: { parse: [] }` — โชว์ชื่อคนกดได้ แต่ **ไม่ ping ใครทั้งนั้น**
     *    ทั้งเจ้าของข้อความเดิมและคนที่ถูกพาดพิงในข้อความ (ไม่งั้นกดทีเดียวเด้งเตือนทั้งห้อง)
     * best-effort ล้วน — ประกาศไม่ออกก็ไม่ควรทำให้ "สร้างการบ้านสำเร็จ" กลายเป็นล้มเหลว
     */
    if (channelId && sourceMessageId) {
      try {
        const ch = await interaction.client.channels.fetch(channelId);
        await ch?.send({
          content: t(assignToSelf ? 'kanban.import.publicMine' : 'kanban.import.publicPool', {
            by: `<@${interaction.user.id}>`, ref: refLabel, title: card.title,
          }),
          reply: { messageReference: sourceMessageId, failIfNotExists: false },
          allowedMentions: { parse: [] },
          flags: MessageFlags.SuppressEmbeds,
        });
      } catch (e) {
        console.error('kanbanImport: ประกาศในห้องไม่สำเร็จ:', e.message);
      }
    }
  } catch (err) {
    console.error('kanbanImport:', err.message);
    await interaction.editReply({ content: t('kanban.import.failed') });
  }
}

module.exports = { handleKanbanImportStart, handleKanbanImportModal };
