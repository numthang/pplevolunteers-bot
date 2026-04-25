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

async function openModal(interaction, messageId, prefill) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_gogo:${messageId}`)
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

async function handleGogoSignup(interaction) {
  if (!interaction.isButton()) return;
  const displayName = interaction.member?.displayName ?? interaction.user.username;
  await openModal(interaction, interaction.message.id, displayName);
}

async function handleGogoEdit(interaction) {
  if (!interaction.isButton()) return;
  const fields = interaction.message.embeds[0]?.fields ?? [];
  const fieldIdx = fields.findIndex(f => f.name.startsWith(FIELD_PREFIX));

  const userNames = fieldIdx >= 0
    ? parseEntries(fields[fieldIdx].value)
        .filter(e => e.userId === interaction.user.id)
        .map(e => e.name)
    : [];

  if (!userNames.length) {
    return interaction.reply({ content: '❌ คุณยังไม่มีชื่อในรายชื่อ', flags: MessageFlags.Ephemeral });
  }

  await openModal(interaction, interaction.message.id, userNames.join('\n'));
}

async function handleGogoModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  const messageId = interaction.customId.split(':')[1];
  const rawInput = interaction.fields.getTextInputValue('field_gogo_names').trim();
  const userId = interaction.user.id;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const msg = await interaction.channel.messages.fetch(messageId).catch(() => null);
  if (!msg) return interaction.editReply({ content: '❌ ไม่พบข้อความต้นทาง' });

  const embed = EmbedBuilder.from(msg.embeds[0]);
  const fields = [...(embed.data.fields ?? [])];
  const fieldIdx = fields.findIndex(f => f.name.startsWith(FIELD_PREFIX));

  let entries = fieldIdx >= 0 ? parseEntries(fields[fieldIdx].value) : [];
  entries = entries.filter(e => e.userId !== userId);

  const newNames = rawInput ? rawInput.split('\n').map(n => n.trim()).filter(Boolean) : [];
  for (const name of newNames) entries.push({ name, userId });

  const newField = {
    name: `${FIELD_PREFIX} (${entries.length} คน)`,
    value: buildFieldValue(entries),
    inline: false,
  };

  if (fieldIdx >= 0) fields[fieldIdx] = newField;
  else fields.push(newField);

  embed.setFields(fields);
  await msg.edit({ embeds: [embed] });

  const reply = newNames.length === 0
    ? '✅ ถอนชื่อทั้งหมดเรียบร้อย'
    : `✅ บันทึกแล้ว — **${newNames.join(', ')}**`;
  await interaction.editReply({ content: reply });
}

module.exports = { handleGogoSignup, handleGogoEdit, handleGogoModal };
