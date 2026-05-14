// commands/channel.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require('discord.js');

const PING_BATCH_SIZE = 25;
const PING_DELAY_MS   = 1000;
const PING_MAX_MEMBERS = 500;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('จัดการ channel (เฉพาะ Moderator)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)

    // --- cleanup ---
    .addSubcommand(sub =>
      sub.setName('cleanup')
        .setDescription('กวาดล้างข้อความในช่องนี้')
        .addIntegerOption(opt =>
          opt.setName('amount')
            .setDescription('จำนวนข้อความที่ต้องการลบ (1-100, default: 100)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(100)
        )
    )

    // --- ping ---
    .addSubcommand(sub =>
      sub.setName('ping')
        .setDescription('ปิง role ในเธรดนี้ ทีละ batch (เฉพาะ Moderator)')
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('Role ที่ต้องการปิง')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('ข้อความแนบท้าย (optional)')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ================================================================
    if (sub === 'cleanup') {
      const amount = interaction.options.getInteger('amount') ?? 100;

      try {
        const deleted = await interaction.channel.bulkDelete(amount, true);

        const embed = new EmbedBuilder()
          .setColor('#ff4444')
          .setTitle('🧹 Cleanup Success')
          .setDescription(`กวาดล้างไปทั้งหมด **${deleted.size}** ข้อความ`)
          .setFooter({ text: `โดย: ${interaction.user.tag}` });

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch {
        return interaction.reply({
          content: 'ลบไม่ได้ครับ! อาจเพราะข้อความเก่าเกิน 14 วัน หรือบอทไม่มีสิทธิ์',
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // ================================================================
    if (sub === 'ping') {
      const THREAD_TYPES = [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread];
      if (!THREAD_TYPES.includes(interaction.channel.type)) {
        return interaction.reply({
          content: 'คำสั่งนี้ใช้ได้เฉพาะในเธรดเท่านั้นครับ',
          flags: MessageFlags.Ephemeral,
        });
      }

      const role    = interaction.options.getRole('role');
      const message = interaction.options.getString('message') ?? '';

      await interaction.guild.members.fetch();
      const members = interaction.guild.members.cache.filter(m => m.roles.cache.has(role.id));
      const ids     = [...members.keys()];

      if (ids.length === 0) {
        return interaction.reply({
          content: `Role **${role.name}** ไม่มีสมาชิกเลยครับ`,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (ids.length > PING_MAX_MEMBERS) {
        return interaction.reply({
          content: `Role **${role.name}** มีสมาชิก **${ids.length} คน** เกินกว่าที่อนุญาต (${PING_MAX_MEMBERS} คน) ครับ`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const batches = [];
      for (let i = 0; i < ids.length; i += PING_BATCH_SIZE) {
        batches.push(ids.slice(i, i + PING_BATCH_SIZE));
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      for (let i = 0; i < batches.length; i++) {
        const mentions = batches[i].map(id => `<@${id}>`).join(' ');
        const suffix   = i === 0 && message ? `\n${message}` : '';
        await interaction.channel.send(`${mentions}${suffix}`);
        if (i < batches.length - 1) await sleep(PING_DELAY_MS);
      }

      return interaction.editReply({
        content: `ปิง **${role.name}** เสร็จแล้วครับ — ${ids.length} คน ใน ${batches.length} messages`,
      });
    }
  },
};
