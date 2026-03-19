const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { ROLES } = require('../config/roles');
const pool = require('../db/index');

// รายชื่อ role ทั้งหมดสำหรับ autocomplete
const ROLE_NAMES = Object.keys(ROLES);

// medal สำหรับ 3 อันดับแรก
const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ratings-top')
    .setDescription('ดู Top Rating ของสมาชิกในแต่ละ Role (เฉพาะ Moderator)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption(opt =>
      opt
        .setName('role')
        .setDescription('ชื่อ Role ที่ต้องการดู')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption(opt =>
      opt
        .setName('top')
        .setDescription('จำนวนอันดับที่ต้องการแสดง (default: 5, max: 20)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(20)
    ),

  // ---- Autocomplete handler ----
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const filtered = ROLE_NAMES
      .filter(name => name.toLowerCase().includes(focused))
      .slice(0, 25); // Discord จำกัด 25 choices
    await interaction.respond(
      filtered.map(name => ({ name, value: name }))
    );
  },

  // ---- Execute ----
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const roleName = interaction.options.getString('role');
    const topN     = interaction.options.getInteger('top') ?? 5;

    // ตรวจสอบว่า role นี้มีใน ROLES จริงไหม
    if (!ROLES[roleName]) {
      return interaction.editReply({
        content: `❌ ไม่พบ Role **${roleName}** ในระบบ กรุณาเลือกจาก autocomplete`,
      });
    }

    // Query: JOIN members (FIND_IN_SET) กับ user_ratings
    // กรอง role ด้วย comma-separated column `roles`
    const [rows] = await pool.execute(
      `SELECT
         m.discord_id,
         m.display_name,
         ROUND(AVG(r.stars), 1) AS avg_stars,
         COUNT(r.id)            AS total
       FROM members m
       JOIN user_ratings r ON r.target_id = m.discord_id
       WHERE FIND_IN_SET(?, m.roles) > 0
       GROUP BY m.discord_id, m.display_name
       HAVING total >= 1
       ORDER BY avg_stars DESC, total DESC
       LIMIT ${topN}`,
      [roleName]
    );

    if (rows.length === 0) {
      return interaction.editReply({
        content: `📭 ยังไม่มีสมาชิกใน **${roleName}** ที่มี rating ครับ`,
      });
    }

    // สร้าง embed
    const lines = rows.map((row, i) => {
      const medal = MEDALS[i] ?? `${i + 1}.`;
      const stars = '⭐'.repeat(Math.round(row.avg_stars)) + ` **${row.avg_stars}**`;
      return `${medal} <@${row.discord_id}> — ${stars}  *(${row.total} รีวิว)*`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xf4c430)
      .setTitle(`🏆 Top ${topN} Rating — ${roleName}`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `แสดง ${rows.length} อันดับ • เรียงตาม avg ดาว` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
