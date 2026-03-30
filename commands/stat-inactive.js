// commands/stat-inactive.js
// /stat-inactive — แสดง members ที่ไม่มี activity เลยในช่วงที่กำหนด

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getInactiveMembers } = require('../db/stat');

const DEFAULT_DAYS = 30;
const DEFAULT_TOP  = 20;

function formatJoined(joinedAt) {
  if (!joinedAt) return '—';
  const diff = Math.floor((Date.now() - new Date(joinedAt).getTime()) / 86400000);
  if (diff === 0) return 'วันนี้';
  if (diff === 1) return 'เมื่อวาน';
  return `${diff} วันที่แล้ว`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stat-inactive')
    .setDescription('แสดง members ที่ไม่มี activity ในช่วงที่กำหนด')
    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('filter เฉพาะ role นี้ (default: ทั้ง server)')
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('days')
        .setDescription(`นับว่า inactive ถ้าไม่มี activity กี่วัน (default ${DEFAULT_DAYS})`)
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(365)
    )
    .addIntegerOption(opt =>
      opt.setName('top')
        .setDescription(`จำนวนที่แสดง (default ${DEFAULT_TOP}, max 50)`)
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(50)
    )
    .addBooleanOption(opt =>
      opt.setName('public')
        .setDescription('แสดงให้ทุกคนเห็น (default: เฉพาะคุณ)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const days     = interaction.options.getInteger('days')   ?? DEFAULT_DAYS;
    const topN     = interaction.options.getInteger('top')    ?? DEFAULT_TOP;
    const isPublic = interaction.options.getBoolean('public') ?? false;
    const role     = interaction.options.getRole('role');

    await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });

    const { guildId, guild } = interaction;
    await guild.members.fetch().catch(() => {});

    // รวม member ids ที่ต้องการตรวจ
    let targetMembers;
    if (role) {
      const guildRole = guild.roles.cache.get(role.id);
      targetMembers = guildRole
        ? [...guildRole.members.values()]
        : [];
    } else {
      targetMembers = [...guild.members.cache.values()].filter(m => !m.user.bot);
    }

    if (!targetMembers.length) {
      return interaction.editReply({ content: 'ไม่พบ members ครับ' });
    }

    // ดึง user_ids ที่มี activity ในช่วง days
    const memberIds = targetMembers.map(m => m.id);
    const activeIds = await getInactiveMembers(guildId, memberIds, days);

    // inactive = อยู่ใน targetMembers แต่ไม่อยู่ใน activeIds
    const inactiveMembers = targetMembers
      .filter(m => !activeIds.has(m.id))
      .sort((a, b) => (a.joinedTimestamp ?? 0) - (b.joinedTimestamp ?? 0)) // join นานสุดก่อน
      .slice(0, topN);

    const title = role
      ? `👻 Inactive — ${role.name}`
      : '👻 Inactive — ทั้ง Server';

    const totalInactive = targetMembers.filter(m => !activeIds.has(m.id)).length;

    const embed = new EmbedBuilder()
      .setColor('#95a5a6')
      .setTitle(title)
      .setDescription(
        `ไม่มี activity ใน ${days} วันที่ผ่านมา\n` +
        `พบทั้งหมด **${totalInactive}** คน — แสดง ${inactiveMembers.length} คน (เรียงจาก join นานสุด)\n\n` +
        (inactiveMembers.length
          ? inactiveMembers.map((m, i) =>
              `**${i + 1}.** <@${m.id}>  🗓 join ${formatJoined(m.joinedAt)}`
            ).join('\n')
          : 'ทุกคน active หมดเลยครับ 🎉')
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
