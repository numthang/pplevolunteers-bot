// handlers/gogoHandler.js
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const FIELD_PREFIX = '👥 รายชื่อผู้สนใจ';

function parseEntries(fieldValue) {
  if (!fieldValue || fieldValue === '-') return [];
  return fieldValue.split('\n').filter(Boolean).map(line => {
    const match = line.match(/^\d+\. (.+?) \(<@(\d+)>\)$/);
    return match ? { name: match[1], userId: match[2] } : null;
  }).filter(Boolean);
}

function buildFieldValue(entries) {
  if (!entries.length) return '-';
  return entries.map((e, i) => `${i + 1}. ${e.name} (<@${e.userId}>)`).join('\n');
}

async function handleGogoSignup(interaction) {
  if (!interaction.isButton()) return;
  const displayName = interaction.member?.displayName ?? interaction.user.username;
  const messageId = interaction.message.id;

  const modal = new ModalBuilder()
    .setCustomId(`modal_gogo:${messageId}`)
    .setTitle('🙋 ลงชื่อสนใจเข้าร่วม');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('field_gogo_name')
        .setLabel('ชื่อที่จะแสดงในรายชื่อ')
        .setStyle(TextInputStyle.Short)
        .setValue(displayName)
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

async function handleGogoModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  const messageId = interaction.customId.split(':')[1];
  const name = interaction.fields.getTextInputValue('field_gogo_name').trim();
  const userId = interaction.user.id;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const msg = await interaction.channel.messages.fetch(messageId).catch(() => null);
  if (!msg) return interaction.editReply({ content: '❌ ไม่พบข้อความต้นทาง' });

  const embed = EmbedBuilder.from(msg.embeds[0]);
  const fields = [...(embed.data.fields ?? [])];
  const fieldIdx = fields.findIndex(f => f.name.startsWith(FIELD_PREFIX));

  let entries = fieldIdx >= 0 ? parseEntries(fields[fieldIdx].value) : [];
  const existingIdx = entries.findIndex(e => e.userId === userId);

  if (existingIdx >= 0) {
    entries[existingIdx].name = name;
  } else {
    entries.push({ name, userId });
  }

  const newField = {
    name: `${FIELD_PREFIX} (${entries.length} คน)`,
    value: buildFieldValue(entries),
    inline: false,
  };

  if (fieldIdx >= 0) {
    fields[fieldIdx] = newField;
  } else {
    fields.push(newField);
  }

  embed.setFields(fields);
  await msg.edit({ embeds: [embed] });

  const action = existingIdx >= 0 ? 'อัปเดตชื่อ' : 'ลงชื่อ';
  await interaction.editReply({ content: `✅ ${action}เรียบร้อย — **${name}**` });
}

async function handleGogoWithdraw(interaction) {
  if (!interaction.isButton()) return;
  const userId = interaction.user.id;
  const msg = interaction.message;

  const embed = EmbedBuilder.from(msg.embeds[0]);
  const fields = [...(embed.data.fields ?? [])];
  const fieldIdx = fields.findIndex(f => f.name.startsWith(FIELD_PREFIX));

  if (fieldIdx < 0) {
    return interaction.reply({ content: '❌ ยังไม่มีรายชื่อ', flags: MessageFlags.Ephemeral });
  }

  let entries = parseEntries(fields[fieldIdx].value);
  const before = entries.length;
  entries = entries.filter(e => e.userId !== userId);

  if (entries.length === before) {
    return interaction.reply({ content: '❌ ไม่พบชื่อของคุณในรายชื่อ', flags: MessageFlags.Ephemeral });
  }

  fields[fieldIdx] = {
    name: `${FIELD_PREFIX} (${entries.length} คน)`,
    value: buildFieldValue(entries),
    inline: false,
  };

  embed.setFields(fields);
  await interaction.deferUpdate();
  await msg.edit({ embeds: [embed] });
  await interaction.followUp({ content: '✅ ถอนชื่อเรียบร้อย', flags: MessageFlags.Ephemeral });
}

module.exports = { handleGogoSignup, handleGogoModal, handleGogoWithdraw };
