// handlers/gogoHandler.js
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
  MessageFlags,
  ChannelType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
} = require('discord.js');
const { getSetting, setSetting } = require('../db/settings');
const { getMember } = require('../db/members');
const { getEntries, upsertEntries } = require('../db/gogo');

// อ่าน session_id จาก customId ของปุ่ม/modal gogo — รูปแบบ `prefix:sid[:...]`
const sidOf = customId => customId.split(':')[1] || null;

// ปุ่มบน message: sid จาก customId → fallback message.id (ปุ่มเก่าก่อน migrate; session_id = message_id หลัง backfill)
const btnSid = interaction => sidOf(interaction.customId) || interaction.message.id;

const FIELD_PREFIX = 'ผู้เข้าร่วม';
const isEntryField = f => f.name.startsWith(FIELD_PREFIX) || f.name.startsWith('👥 ' + FIELD_PREFIX);

const DM_ALLOWED_ROLE_NAMES = new Set([
  'Admin', 'Moderator', 'เจ้าหน้าที่พรรค', 'รองเลขาธิการ',
  'ผู้ประสานงานภาค', 'ผู้ประสานงานจังหวัด', 'กรรมการจังหวัด',
]);

function buildFieldValue(entries) {
  if (!entries.length) return '-';
  const groups = new Map();
  for (const { name, userId } of entries) {
    if (!groups.has(userId)) groups.set(userId, []);
    groups.get(userId).push(name);
  }
  const MAX_LEN = 1024;   // ลิมิต Discord field value
  const MAX_NAME = 14;    // ตัดชื่อพร็อกซีที่ยาวเกิน
  const total = entries.length;
  const trunc = s => s.length > MAX_NAME ? s.slice(0, MAX_NAME - 1) + '…' : s;
  let result = '';
  let shownCount = 0;

  function tryAppend(part, partCount) {
    const remaining = total - shownCount - partCount;
    const suffix = remaining > 0 ? ` · +${remaining} คน` : '';
    const candidate = result ? result + ' · ' + part : part;
    if ((candidate + suffix).length <= MAX_LEN) {
      result = candidate;
      shownCount += partCount;
      return true;
    }
    return false;
  }

  // 1. compact mention for self-only users, full link for users with extras
  for (const [userId, names] of groups.entries()) {
    const hasExtras = names.some(Boolean);
    const emptyCount = names.filter(n => !n).length;
    // ลงชื่อให้คนอื่นอย่างเดียว (ไม่มี self-entry) → ไม่แสดง mention
    if (emptyCount === 0 && hasExtras) continue;
    const partCount = hasExtras ? emptyCount : (emptyCount || 1);
    const part = hasExtras
      ? `<@${userId}> [🔗](https://discord.com/users/${userId})`
      : `<@${userId}>`;
    if (!tryAppend(part, partCount)) {
      const hidden = total - shownCount;
      if (hidden > 0 && result) result += ` · +${hidden} คน`;
      return result || '-';
    }
  }

  // 2. extra names — truncate ชื่อยาว
  for (const [userId, names] of groups.entries()) {
    for (const n of names.filter(Boolean)) {
      if (!tryAppend(`[${trunc(n)}](https://discord.com/users/${userId})`, 1)) {
        const hidden = total - shownCount;
        if (hidden > 0 && result) result += ` · +${hidden} คน`;
        return result || '-';
      }
    }
  }

  return result || '-';
}

async function handleGogoSignup(interaction) {
  if (!interaction.isButton()) return;
  const { guildId } = interaction;
  const sid = btnSid(interaction);
  const userId = interaction.user.id;

  const allEntries = await getEntries(guildId, sid);
  const myEntries = allEntries.filter(e => e.user_id === userId);
  const displayName = interaction.member?.displayName ?? interaction.user.username;
  // self-entry (name='') แสดงเป็นชื่อจริงเพื่อให้ round-trip ตอน submit ได้
  const prefill = myEntries.length > 0 ? myEntries.map(e => e.name || displayName).join('\n') : displayName;

  // ยัด sid (key DB) + message.id ปัจจุบัน (ไว้ edit embed) — modal submit ไม่มี interaction.message
  // timestamp กัน Discord cache modal เก่า
  const modal = new ModalBuilder()
    .setCustomId(`modal_gogo:${sid}:${interaction.message.id}:${Date.now()}`)
    .setTitle('🙋 รายชื่อผู้เข้าร่วม');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('field_gogo_names')
        .setLabel('ชื่อผู้เข้าร่วม (หลายคนได้ ขึ้นบรรทัดใหม่)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(prefill)
        .setPlaceholder('เช่น\nตั้ม\nพี่โอ๊ต\nฝน')
        .setRequired(false)
    )
  );

  await interaction.showModal(modal);
}

async function handleGogoModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  // customId = modal_gogo:${sid}:${msgId}:${ts}
  const [, sid, customMsgId] = interaction.customId.split(':');
  const rawInput  = interaction.fields.getTextInputValue('field_gogo_names').trim();
  const userId    = interaction.user.id;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // sticky config (per-channel) — source ของ current message_id + ที่เก็บ embed snapshot
  const stickyKey = `sticky_${interaction.channelId}`;
  let stickyConfig = await getSetting(interaction.guildId, stickyKey);
  if (typeof stickyConfig === 'string') {
    try { stickyConfig = JSON.parse(stickyConfig); } catch { stickyConfig = null; }
  }

  // หา live message: msgId จาก customId ก่อน (fallback current message_id จาก sticky config เผื่อ repost)
  let msg = await interaction.channel.messages.fetch(customMsgId).catch(() => null);
  if (!msg && stickyConfig?.message_id) {
    msg = await interaction.channel.messages.fetch(stickyConfig.message_id).catch(() => null);
  }
  // ต้องมี embed source อย่างน้อยจาก msg หรือ sticky config
  const srcEmbedJson = msg?.embeds?.[0]?.toJSON?.() ?? stickyConfig?.embeds?.[0];
  if (!srcEmbedJson) return interaction.editReply({ content: '❌ ไม่พบข้อความต้นทาง' });

  const displayName = interaction.member?.displayName ?? interaction.user.username;

  // เขียน DB (key = sid — ไม่ผูกกับ message_id ที่ churn)
  const newNames = rawInput ? rawInput.split('\n').map(n => n.trim()).filter(Boolean) : [];
  if (newNames.length > 10) {
    return interaction.editReply({ content: '❌ ชื่อได้สูงสุด 10 คนต่อ 1 ครั้ง' });
  }
  // บรรทัดที่ตรงชื่อตัวเอง → self-entry (name = '') ป้องกัน display ซ้ำ + round-trip กับ prefill
  const normalized = newNames.map(n => n === displayName ? '' : n)
  await upsertEntries(interaction.guildId, sid, userId, normalized);

  // อ่าน DB เพื่อ render embed
  const allEntries = await getEntries(interaction.guildId, sid);
  const dbEntries = allEntries.map(({ user_id: u, name: n }) => {
    if (u === userId && n === displayName) return { userId: u, name: '' };
    return { userId: u, name: n };
  });

  const embed    = EmbedBuilder.from(srcEmbedJson);
  const fields   = [...(embed.data.fields ?? [])];
  const fieldIdx = fields.findIndex(f => isEntryField(f));
  const baseName = fieldIdx >= 0
    ? fields[fieldIdx].name.replace(/ \(\d+ คน\)$/, '').replace(/^👥 /, '')
    : FIELD_PREFIX;
  const newField = { name: `${baseName} (${allEntries.length} คน)`, value: buildFieldValue(dbEntries), inline: false };
  if (fieldIdx >= 0) fields[fieldIdx] = newField;
  else fields.push(newField);
  embed.setFields(fields);

  // ปุ่มต้อง carry sid เสมอ (ไม่งั้น repost/ปุ่มใหม่จะไม่มี sid)
  const latestRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`btn_gogo_signup:${sid}`).setLabel('🙋 เข้าร่วม').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('btn_gogo_event').setEmoji('🗓️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_gogo_dm:${sid}`).setEmoji('📢').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_gogo_list:${sid}`).setEmoji('📋').setStyle(ButtonStyle.Secondary),
  );

  // อัปเดต sticky embed snapshot เสมอ (sticky re-render จาก snapshot ไม่ใช่ DB) — 1 gogo/ห้อง
  if (stickyConfig) {
    stickyConfig.embeds = [embed.toJSON()];
    stickyConfig.components = [latestRow.toJSON()];
    await setSetting(interaction.guildId, stickyKey, stickyConfig);
  }

  if (msg) await msg.edit({ embeds: [embed], components: [latestRow] }).catch(() => {});

  if (rawInput && interaction.channel.isThread()) {
    await interaction.channel.members.add(userId).catch(() => {});
  }

  await interaction.deleteReply();
}

async function handleGogoDMButton(interaction) {
  if (!interaction.isButton()) return;

  const userId    = interaction.user.id;
  const sid       = btnSid(interaction);
  const creatorId = await getSetting(interaction.guildId, `gogo_creator:${sid}`);
  const isCreator = creatorId === userId;

  let allowed = isCreator;

  if (!allowed) {
    // เช็ค Discord API (real-time)
    const member = await interaction.guild.members.fetch(userId);
    allowed = member.roles.cache.some(r => DM_ALLOWED_ROLE_NAMES.has(r.name));
  }

  if (!allowed) {
    // fallback เช็ค org_members.roles (กรณี cache ไม่ sync)
    const dbMember = await getMember(interaction.guildId, userId);
    if (dbMember?.roles) {
      const dbRoles = dbMember.roles.split(',').map(r => r.trim());
      allowed = dbRoles.some(r => DM_ALLOWED_ROLE_NAMES.has(r));
    }
  }

  if (!allowed) {
    return interaction.reply({ content: '❌ โปรดติดต่อ กรรมการจังหวัด หรือ Moderator', flags: MessageFlags.Ephemeral });
  }

  const ch = interaction.channel;
  let firstContent = '';
  if (ch.isThread()) {
    const msgs = await ch.messages.fetch({ limit: 1, after: '0' }).catch(() => null);
    firstContent = msgs?.first()?.content ?? '';
  } else {
    firstContent = ch.topic ?? '';
  }

  const defaultText = ch.name ?? '';

  const entries   = await getEntries(interaction.guildId, sid);
  const names     = [...new Set(entries.map(e => e.name).filter(Boolean))];
  const modalTitle  = `📢 DM: ${names.join(', ')}`.length <= 45
    ? `📢 DM: ${names.join(', ')}`
    : `📢 DM ผู้ลงชื่อ (${entries.length} คน)`;

  const modal = new ModalBuilder()
    .setCustomId(`modal_gogo_dm:${sid}`)
    .setTitle(modalTitle);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('dm_body')
        .setLabel('เนื้อหา')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(defaultText)
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

async function handleGogoDMModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  const sid  = sidOf(interaction.customId);
  const body = interaction.fields.getTextInputValue('dm_body').trim();

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const entries = await getEntries(interaction.guildId, sid);
  const uniqueUserIds = [...new Set(entries.map(e => e.user_id))];

  if (!uniqueUserIds.length) return interaction.editReply({ content: '❌ ยังไม่มีผู้ลงชื่อ' });

  let success = 0, fail = 0;
  for (const userId of uniqueUserIds) {
    try {
      const user = await interaction.client.users.fetch(userId);
      await user.send(`${body} — <@${interaction.user.id}>`);
      success++;
    } catch {
      fail++;
    }
  }

  await interaction.editReply({
    content: `✅ ส่ง DM สำเร็จ ${success} คน${fail ? ` · ❌ ส่งไม่ได้ ${fail} คน` : ''}`,
  });
}

async function handleGogoEventButton(interaction) {
  if (!interaction.isButton()) return;

  const voiceChannels = interaction.guild.channels.cache
    .filter(c => c.type === ChannelType.GuildVoice)
    .sort((a, b) => a.position - b.position)
    .first(25);

  if (!voiceChannels.length) {
    return interaction.reply({ content: '❌ ไม่พบ voice channel ในเซิร์ฟเวอร์', flags: MessageFlags.Ephemeral });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('select_gogo_event')
    .setPlaceholder('เลือกห้องประชุม')
    .addOptions(voiceChannels.map(ch =>
      new StringSelectMenuOptionBuilder().setLabel(ch.name).setValue(ch.id)
    ));

  await interaction.reply({
    content: 'เลือกห้องประชุม',
    components: [new ActionRowBuilder().addComponents(select)],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleGogoEventSelect(interaction) {
  if (!interaction.isStringSelectMenu()) return;

  const voiceChannelId = interaction.values[0];
  const ch = interaction.channel;

  let description = '';
  if (ch.isThread()) {
    const msgs = await ch.messages.fetch({ limit: 1, after: '0' }).catch(() => null);
    description = msgs?.first()?.content ?? '';
  }

  const modal = new ModalBuilder()
    .setCustomId(`modal_gogo_event:${voiceChannelId}`)
    .setTitle('📅 สร้างนัดประชุม');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('event_name')
        .setLabel('ชื่อกิจกรรม')
        .setStyle(TextInputStyle.Short)
        .setValue(ch.name ?? '')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('event_desc')
        .setLabel('รายละเอียด (ไม่บังคับ)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(description.slice(0, 3900))
        .setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('event_date')
        .setLabel('วันที่ (YYYY-MM-DD)')
        .setStyle(TextInputStyle.Short)
        .setValue(new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10))
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('event_time')
        .setLabel('เวลาเริ่ม (HH:MM)')
        .setStyle(TextInputStyle.Short)
        .setValue('20:00')
        .setRequired(true)
    ),
  );

  await interaction.showModal(modal);
}

async function handleGogoEventModal(interaction) {
  if (!interaction.isModalSubmit()) return;

  const voiceChannelId = interaction.customId.split(':')[1];
  const name           = interaction.fields.getTextInputValue('event_name').trim();
  const description    = interaction.fields.getTextInputValue('event_desc').trim();
  const date           = interaction.fields.getTextInputValue('event_date').trim();
  const time           = interaction.fields.getTextInputValue('event_time').trim();

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const startTime = new Date(`${date}T${time}:00+07:00`);
  if (isNaN(startTime.getTime())) {
    return interaction.editReply({ content: '❌ วันที่หรือเวลาไม่ถูกต้อง' });
  }

  let event;
  try {
    event = await interaction.guild.scheduledEvents.create({
      name,
      description: description || undefined,
      scheduledStartTime: startTime,
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType:   GuildScheduledEventEntityType.Voice,
      channel:      voiceChannelId,
    });
  } catch (err) {
    return interaction.editReply({ content: `❌ สร้าง event ไม่ได้: ${err.message}` });
  }

  const link    = `https://discord.com/events/${interaction.guildId}/${event.id}`;
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
  const toGCal  = d => d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const gcal    = new URL('https://calendar.google.com/calendar/render');
  gcal.searchParams.set('action', 'TEMPLATE');
  const calendarId = await getSetting(interaction.guildId, 'gogo_calendar_id');
  if (calendarId) gcal.searchParams.set('src', calendarId);
  gcal.searchParams.set('text', name);
  gcal.searchParams.set('dates', `${toGCal(startTime)}/${toGCal(endTime)}`);
  if (description) gcal.searchParams.set('details', description);
  const voiceCh = interaction.guild.channels.cache.get(voiceChannelId);
  if (voiceCh) gcal.searchParams.set('location', voiceCh.name);

  const calRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Add to Google Calendar')
      .setEmoji('🗓️')
      .setURL(gcal.toString())
      .setStyle(ButtonStyle.Link),
  );
  await interaction.channel.send({ content: `📅 นัดประชุม: ${link}`, components: [calRow] });
  await interaction.editReply({ content: '✅ สร้าง event เรียบร้อยแล้ว' });
}

async function handleGogoListButton(interaction) {
  if (!interaction.isButton()) return;
  const entries = await getEntries(interaction.guildId, btnSid(interaction));

  if (!entries.length) {
    return interaction.reply({ content: '📋 ยังไม่มีผู้เข้าร่วม', flags: MessageFlags.Ephemeral });
  }

  const groups = new Map();
  for (const { user_id, name } of entries) {
    if (!groups.has(user_id)) groups.set(user_id, []);
    groups.get(user_id).push(name);
  }

  const lines = [];
  let i = 1;
  for (const [userId, names] of groups.entries()) {
    const extras = names.filter(Boolean);
    lines.push(extras.length
      ? `${i++}. <@${userId}> — ${extras.join(', ')}`
      : `${i++}. <@${userId}>`);
  }

  const embed = new EmbedBuilder()
    .setTitle(`📋 รายชื่อผู้เข้าร่วม (${entries.length} คน)`)
    .setDescription(lines.join('\n').slice(0, 4096));

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { handleGogoSignup, handleGogoModal, handleGogoDMButton, handleGogoDMModal, handleGogoEventButton, handleGogoEventSelect, handleGogoEventModal, handleGogoListButton };
