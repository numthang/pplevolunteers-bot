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
const { ROLES } = require('../config/roles');
const { getMember } = require('../db/members');

const FIELD_PREFIX = '👥 ผู้เข้าร่วม';

const DM_ALLOWED_ROLE_IDS = new Set([
  ROLES['Admin'],
  ROLES['Moderator'],
  ROLES['เจ้าหน้าที่พรรค'],
  ROLES['รองเลขาธิการ'],
  ROLES['ผู้ประสานงานภาค'],
  ROLES['ผู้ประสานงานจังหวัด'],
  ROLES['กรรมการจังหวัด'],
]);

const DM_ALLOWED_ROLE_NAMES = new Set([
  'Admin', 'Moderator', 'เจ้าหน้าที่พรรค', 'รองเลขาธิการ',
  'ผู้ประสานงานภาค', 'ผู้ประสานงานจังหวัด', 'กรรมการจังหวัด',
]);

// รองรับทั้ง format เก่า "1. ชื่อ (<@id>)" และ format ใหม่ "ชื่อ1, ชื่อ2 <@id> · ชื่อ3 <@id2>"
function parseEntries(fieldValue) {
  if (!fieldValue || fieldValue === '-') return [];
  if (fieldValue.startsWith('1.')) {
    // format เก่า
    return fieldValue.split('\n').filter(Boolean).map(line => {
      const match = line.match(/^\d+\. (.+?) \(<@(\d+)>\)$/);
      return match ? { name: match[1], userId: match[2] } : null;
    }).filter(Boolean);
  }
  // format ใหม่: "[ชื่อ](https://discord.com/users/id), [ชื่อ2](...) · [ชื่อ3](...)"
  const entries = [];
  for (const match of fieldValue.matchAll(/\[([^\]]+)\]\(https:\/\/discord\.com\/users\/(\d+)\)/g)) {
    entries.push({ name: match[1], userId: match[2] });
  }
  return entries;
}

function buildFieldValue(entries) {
  if (!entries.length) return '-';
  const groups = new Map();
  for (const { name, userId } of entries) {
    if (!groups.has(userId)) groups.set(userId, []);
    groups.get(userId).push(name);
  }
  return [...groups.entries()]
    .map(([userId, names]) => names.map(n => `[${n}](https://discord.com/users/${userId})`).join(', '))
    .join(' · ');
}

async function handleGogoSignup(interaction) {
  if (!interaction.isButton()) return;
  const fields = interaction.message.embeds[0]?.fields ?? [];
  const fieldIdx = fields.findIndex(f => f.name.startsWith(FIELD_PREFIX));

  const existingNames = fieldIdx >= 0
    ? parseEntries(fields[fieldIdx].value).filter(e => e.userId === interaction.user.id).map(e => e.name)
    : [];

  const prefill = existingNames.length
    ? existingNames.join('\n')
    : (interaction.member?.displayName ?? interaction.user.username);

  const modal = new ModalBuilder()
    .setCustomId(`modal_gogo:${interaction.message.id}`)
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
  const messageId = interaction.customId.split(':')[1];
  const rawInput  = interaction.fields.getTextInputValue('field_gogo_names').trim();
  const userId    = interaction.user.id;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const msg = await interaction.channel.messages.fetch(messageId).catch(() => null);
  if (!msg) return interaction.editReply({ content: '❌ ไม่พบข้อความต้นทาง' });

  const embed    = EmbedBuilder.from(msg.embeds[0]);
  const fields   = [...(embed.data.fields ?? [])];
  const fieldIdx = fields.findIndex(f => f.name.startsWith(FIELD_PREFIX));

  let entries = fieldIdx >= 0 ? parseEntries(fields[fieldIdx].value) : [];
  entries = entries.filter(e => e.userId !== userId);
  const newNames = rawInput ? rawInput.split('\n').map(n => n.trim()).filter(Boolean) : [];
  for (const name of newNames) entries.push({ name, userId });

  const baseName = fieldIdx >= 0 ? fields[fieldIdx].name.replace(/ \(\d+ คน\)$/, '') : FIELD_PREFIX;
  const newField = { name: `${baseName} (${entries.length} คน)`, value: buildFieldValue(entries), inline: false };

  if (fieldIdx >= 0) fields[fieldIdx] = newField;
  else fields.push(newField);

  embed.setFields(fields);

  const stickyKey = `sticky_${interaction.channelId}`;
  let stickyConfig = await getSetting(interaction.guildId, stickyKey);
  if (typeof stickyConfig === 'string') {
    try { stickyConfig = JSON.parse(stickyConfig); } catch { stickyConfig = null; }
  }
  if (stickyConfig && stickyConfig.message_id === messageId) {
    stickyConfig.embeds = [embed.toJSON()];
    await setSetting(interaction.guildId, stickyKey, stickyConfig);
  }

  await msg.edit({ embeds: [embed] });

  if (rawInput && interaction.channel.isThread()) {
    await interaction.channel.members.add(userId).catch(() => {});
  }

  await interaction.deleteReply();
}

async function handleGogoDMButton(interaction) {
  if (!interaction.isButton()) return;

  const userId    = interaction.user.id;
  const creatorId = await getSetting(interaction.guildId, `gogo_creator:${interaction.message.id}`);
  const isCreator = creatorId === userId;

  let allowed = isCreator;

  if (!allowed) {
    // เช็ค Discord API (real-time)
    const member = await interaction.guild.members.fetch(userId);
    allowed = [...DM_ALLOWED_ROLE_IDS].some(id => member.roles.cache.has(id));
  }

  if (!allowed) {
    // fallback เช็ค dc_members.roles (กรณี cache ไม่ sync)
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

  const embedFields = interaction.message.embeds[0]?.fields ?? [];
  const entryField  = embedFields.findIndex(f => f.name.startsWith(FIELD_PREFIX));
  const entries     = entryField >= 0 ? parseEntries(embedFields[entryField].value) : [];
  const names       = [...new Set(entries.map(e => e.name))];
  const modalTitle  = `📢 DM: ${names.join(', ')}`.length <= 45
    ? `📢 DM: ${names.join(', ')}`
    : `📢 DM ผู้ลงชื่อ (${entries.length} คน)`;

  const modal = new ModalBuilder()
    .setCustomId(`modal_gogo_dm:${interaction.message.id}`)
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
  const messageId = interaction.customId.split(':')[1];
  const body      = interaction.fields.getTextInputValue('dm_body').trim();

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const msg = await interaction.channel.messages.fetch(messageId).catch(() => null);
  if (!msg) return interaction.editReply({ content: '❌ ไม่พบข้อความต้นทาง' });

  const fields   = msg.embeds[0]?.fields ?? [];
  const fieldIdx = fields.findIndex(f => f.name.startsWith(FIELD_PREFIX));
  const entries  = fieldIdx >= 0 ? parseEntries(fields[fieldIdx].value) : [];

  if (!entries.length) return interaction.editReply({ content: '❌ ยังไม่มีผู้ลงชื่อ' });

  let success = 0, fail = 0;
  for (const { userId } of entries) {
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

module.exports = { handleGogoSignup, handleGogoModal, handleGogoDMButton, handleGogoDMModal, handleGogoEventButton, handleGogoEventSelect, handleGogoEventModal };
