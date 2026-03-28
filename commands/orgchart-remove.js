// commands/orgchart-remove.js
// ลบ หรือ exclude channel/role ออกจาก config

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { deleteChannel, deleteRole, excludeChannel, unexcludeChannel } = require('../db/orgchartConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('orgchart-remove')
    .setDescription('ลบหรือ exclude channel/role ออกจาก config (Admin only)')
    .setDefaultMemberPermissions(0x8)
    .addRoleOption(opt =>
      opt.setName('role').setDescription('Role ที่ต้องการแก้ไข').setRequired(true)
    )
    .addChannelOption(opt =>
      opt.setName('channel').setDescription('Channel ที่ต้องการแก้ไข (ไม่ระบุ = ทั้ง role)').setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('action')
        .setDescription('การกระทำ (default: ลบถาวร)')
        .setRequired(false)
        .addChoices(
          { name: '🗑️ ลบถาวร (default)', value: 'delete'    },
          { name: '⛔ Exclude (ไม่ track แต่ยังอยู่ใน config)', value: 'exclude'   },
          { name: '✅ Unexclude (กลับมา track)', value: 'unexclude' },
        )
    ),

  async execute(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ ต้องการสิทธิ์ Administrator', flags: MessageFlags.Ephemeral });
    }

    const role    = interaction.options.getRole('role');
    const channel = interaction.options.getChannel('channel');
    const action  = interaction.options.getString('action') ?? 'exclude';

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (action === 'exclude') {
      if (!channel) {
        return interaction.editReply({ content: '❌ ต้องระบุ channel สำหรับ exclude ครับ' });
      }
      await excludeChannel(interaction.guildId, role.id, channel.id);
      return interaction.editReply({
        content: `⛔ Excluded **#${channel.name}** จาก **${role.name}** แล้วครับ — ยังอยู่ใน config แต่จะไม่ track`,
      });
    }

    if (action === 'unexclude') {
      if (!channel) {
        return interaction.editReply({ content: '❌ ต้องระบุ channel สำหรับ unexclude ครับ' });
      }
      await unexcludeChannel(interaction.guildId, role.id, channel.id);
      return interaction.editReply({
        content: `✅ Unexcluded **#${channel.name}** จาก **${role.name}** แล้วครับ — กลับมา track แล้ว`,
      });
    }

    // delete
    if (channel) {
      await deleteChannel(interaction.guildId, role.id, channel.id);
      return interaction.editReply({
        content: `✅ ลบ **#${channel.name}** ออกจาก **${role.name}** แล้วครับ`,
      });
    } else {
      await deleteRole(interaction.guildId, role.id);
      return interaction.editReply({
        content: `✅ ลบ **${role.name}** ออกจาก config ทั้งหมดแล้วครับ`,
      });
    }
  },
};
