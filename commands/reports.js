// db/reports.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { getReportList, getReportCount, getReportById, updateReport } = require('../db/reports');

const PER_PAGE = 5;

const STATUS_LABEL = {
  pending:       '🟡 รอดำเนินการ',
  investigating: '🔵 กำลังตรวจสอบ',
  closed:        '🟢 ปิดเคส',
};

const CATEGORY_LABEL = {
  harassment:    '🚫 การคุกคาม/ข่มขู่',
  spam:          '📢 สแปม',
  fraud:         '💸 โกง/หลอกลวง',
  misconduct:    '⚠️ พฤติกรรมไม่เหมาะสม',
  impersonation: '👤 แอบอ้างตัวตน',
  other:         '📝 อื่นๆ',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reports')
    .setDescription('จัดการรายงานร้องเรียน (เฉพาะ Moderator)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('ดูรายการร้องเรียนทั้งหมด')
        .addStringOption(opt =>
          opt.setName('status')
            .setDescription('กรองตาม status')
            .setRequired(false)
            .addChoices(
              { name: '🟡 รอดำเนินการ', value: 'pending' },
              { name: '🔵 กำลังตรวจสอบ', value: 'investigating' },
              { name: '🟢 ปิดเคส',       value: 'closed' },
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('ดูรายละเอียดเคส')
        .addIntegerOption(opt =>
          opt.setName('id').setDescription('Report ID').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('update')
        .setDescription('อัพเดท status และ note')
        .addIntegerOption(opt =>
          opt.setName('id').setDescription('Report ID').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('status')
            .setDescription('Status ใหม่')
            .setRequired(true)
            .addChoices(
              { name: '🟡 รอดำเนินการ', value: 'pending' },
              { name: '🔵 กำลังตรวจสอบ', value: 'investigating' },
              { name: '🟢 ปิดเคส',       value: 'closed' },
            )
        )
        .addStringOption(opt =>
          opt.setName('note')
            .setDescription('บันทึกของ Mod (optional)')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();

    // ---- list ----
    if (sub === 'list') {
      const status = interaction.options.getString('status');
      const page   = 1;
      const rows   = await getReportList(status, page, PER_PAGE);
      const total  = await getReportCount(status);
      const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

      const lines = rows.length === 0
        ? '_ไม่มีรายการ_'
        : rows.map(r => {
            const date   = new Date(r.created_at).toLocaleDateString('th-TH');
            const who    = r.is_anonymous ? '_Anonymous_' : `<@${r.reporter_id}>`;
            const status = STATUS_LABEL[r.status] ?? r.status;
            return `**#${r.id}** ${CATEGORY_LABEL[r.category] ?? r.category} • <@${r.target_id}> • ${status}\n↳ โดย ${who} • ${date}`;
          }).join('\n\n');

      const embed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle(`🚨 รายการร้องเรียน${status ? ` — ${STATUS_LABEL[status]}` : ''}`)
        .setDescription(lines)
        .setFooter({ text: `หน้า ${page}/${totalPages} • ทั้งหมด ${total} รายการ` });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`reports_page:${status ?? 'all'}:${page - 1}`)
          .setLabel('◀ ก่อนหน้า')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId(`reports_page:${status ?? 'all'}:${page + 1}`)
          .setLabel('ถัดไป ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages),
      );

      return interaction.editReply({ embeds: [embed], components: [row] });
    }

    // ---- view ----
    if (sub === 'view') {
      const id     = interaction.options.getInteger('id');
      const report = await getReportById(id);

      if (!report) return interaction.editReply({ content: `❌ ไม่พบเคส #${id}` });

      const embed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle(`🚨 เคส #${report.id} — ${CATEGORY_LABEL[report.category] ?? report.category}`)
        .addFields(
          { name: '👤 ผู้ถูกร้องเรียน', value: `<@${report.target_id}> (${report.target_name})`, inline: true },
          { name: '📌 Status',          value: STATUS_LABEL[report.status] ?? report.status, inline: true },
          { name: '👁️ ผู้ร้องเรียน',   value: report.is_anonymous ? '_Anonymous_' : `<@${report.reporter_id}> (${report.reporter_name})`, inline: true },
          { name: '📝 รายละเอียด',      value: report.detail },
          { name: '🔗 หลักฐาน',         value: report.evidence ?? '_ไม่มี_', inline: true },
          { name: '🗒️ Mod Note',        value: report.mod_note ?? '_ยังไม่มี_', inline: true },
        )
        .setTimestamp(new Date(report.created_at));

      return interaction.editReply({ embeds: [embed] });
    }

    // ---- update ----
    if (sub === 'update') {
      const id     = interaction.options.getInteger('id');
      const status = interaction.options.getString('status');
      const note   = interaction.options.getString('note');

      const report = await getReportById(id);
      if (!report) return interaction.editReply({ content: `❌ ไม่พบเคส #${id}` });

      await updateReport(id, { status, modNote: note });

      return interaction.editReply({
        content: `✅ อัพเดทเคส **#${id}** เป็น ${STATUS_LABEL[status]} แล้ว${note ? `\n📝 Note: ${note}` : ''}`,
      });
    }
  },
};
