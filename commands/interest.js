// commands/interest.js
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags
} = require('discord.js');
const { INTEREST_ROLES, SKILL_ROLES } = require('../config/roles');
const { INTEREST_BUTTONS, SKILL_BUTTONS } = require('../config/constants');
/* 
const INTEREST_BUTTONS = [
  { label: 'อาสาประชาชน', emoji: '🍊', key: 'อาสาประชาชน' },
  { label: 'ทีมตัวแทนสมาชิก', emoji: '👥', key: 'ทีมตัวแทนสมาชิก' },
  { label: 'ทีมเครือข่ายชาติพันธุ์', emoji: '🧣', key: 'ทีมเครือข่ายชาติพันธุ์' },
  { label: 'ประชาชนคนเกษตร', emoji: '🌾', key: 'ประชาชนคนเกษตร' },
  { label: 'ทีมเครือข่ายผู้ใช้แรงงาน', emoji: '✊', key: 'ทีมเครือข่ายผู้ใช้แรงงาน' },
  { label: 'ทีมงานสภา', emoji: '🏛️', key: 'ทีมงานสภา' },
  { label: 'ทีมจังหวัด/สมาชิกสัมพันธ์', emoji: '🤝', key: 'ทีมจังหวัด/สมาชิกสัมพันธ์' },
  { label: 'ทีมผู้ช่วยหาเสียง/เรื่องร้องเรียน', emoji: '📣', key: 'ทีมผู้ช่วยหาเสียง/เรื่องร้องเรียน' },
  { label: 'ทีมผู้สมัครรับเลือกตั้ง', emoji: '🪪', key: 'ทีมผู้สมัครรับเลือกตั้ง' },
  { label: 'ทีมเจ้าหน้าที่/สตาฟ', emoji: '👷', key: 'ทีมเจ้าหน้าที่/สตาฟ' },
  { label: 'ทีมระดมทุน', emoji: '💰', key: 'ทีมระดมทุน' },
  { label: 'เด็กติดเกม', emoji: '🎲', key: 'เด็กติดเกม' },
];

const SKILL_BUTTONS = [
  { label: 'ทีมกระบวนกร', emoji: '🧙', key: 'ทีมกระบวนกร' },
  { label: 'ทีมกราฟิก', emoji: '🖼️', key: 'ทีมกราฟิก' },
  { label: 'ทีมคอนเทนต์', emoji: '✍️', key: 'ทีมคอนเทนต์' },
  { label: 'ทีมตัดต่อ', emoji: '🎬', key: 'ทีมตัดต่อ' },
  { label: 'ทีมช่างภาพ', emoji: '📸', key: 'ทีมช่างภาพ' },
  { label: 'ทีมนโยบาย', emoji: '📊', key: 'ทีมนโยบาย' },
  { label: 'ทีม9geek', emoji: '💻', key: 'ทีม9geek' },
  { label: 'ทีมกฎหมาย', emoji: '⚖️', key: 'ทีมกฎหมาย' },
];
 */
function buildRows(buttons, roleMap, memberRoles, prefix) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += 4) {
    const chunk = buttons.slice(i, i + 4);
    rows.push(
      new ActionRowBuilder().addComponents(
        chunk.map((b) => {
          const roleId = roleMap[b.key];
          const hasRole = roleId && memberRoles.cache.has(roleId);
          return new ButtonBuilder()
            .setCustomId(`${prefix}:${b.key}`)
            .setLabel(b.label)
            .setEmoji(b.emoji)
            .setStyle(hasRole ? ButtonStyle.Primary : ButtonStyle.Secondary);
        })
      )
    );
  }
  return rows;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('interest')
    .setDescription('เลือกความสนใจและความถนัดของคุณ')
    .addBooleanOption(option =>
      option
      .setName('ephemeral')
      .setDescription('แสดงผลแบบส่วนตัว')
      .setRequired(false)
    ),

  async execute(interaction) {
    const memberRoles = interaction.member.roles;
    //const ephemeral = interaction.options.getBoolean('ephemeral') ?? true;

    const interestEmbed = new EmbedBuilder()
      .setTitle('🎯 ความสนใจของคุณคืออะไร?')
      .setDescription('กดเพื่อเลือก • กดซ้ำเพื่อถอด\n🔵 = มี role อยู่แล้ว • ⬜ = ยังไม่มี')
      .setColor(0xf1c40f);

    const skillEmbed = new EmbedBuilder()
      .setTitle('🛠️ ความถนัดของคุณคืออะไร?')
      .setDescription('กดเพื่อเลือก • กดซ้ำเพื่อถอด\n🔵 = มี role อยู่แล้ว • ⬜ = ยังไม่มี')
      .setColor(0x3498db);

    // ... ในบล็อก execute ...
    const isEphemeral = interaction.options.getBoolean('ephemeral') ?? true;
    const flags = isEphemeral ? MessageFlags.Ephemeral : undefined;

    // Message 1: ความสนใจ
    await interaction.reply({
      embeds: [interestEmbed],
      components: buildRows(INTEREST_BUTTONS, INTEREST_ROLES, memberRoles, 'interest'),
      flags,
    });

    // Message 2: ความถนัด
    await interaction.followUp({
      embeds: [skillEmbed],
      components: buildRows(SKILL_BUTTONS, SKILL_ROLES, memberRoles, 'skill'),
      flags,
    });
  },

  // export ไว้ให้ handler ใช้ rebuild rows หลัง toggle
  buildRows,
};