// commands/role.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const { handleRoleMembersCmd } = require('../handlers/roleBulkHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('จัดการ Role (เฉพาะ Moderator)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)

    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('เพิ่ม role ให้สมาชิกทีละหลายคน')
        .addRoleOption(opt =>
          opt.setName('role').setDescription('Role ที่ต้องการเพิ่ม').setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub.setName('members')
        .setDescription('แสดงรายชื่อสมาชิกทั้งหมดใน role')
        .addRoleOption(opt =>
          opt.setName('role').setDescription('Role ที่ต้องการดู').setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const role = interaction.options.getRole('role');

      const modal = new ModalBuilder()
        .setCustomId(`role_add_modal:${role.id}`)
        .setTitle(`เพิ่ม Role: ${role.name}`);

      const input = new TextInputBuilder()
        .setCustomId('role_usernames')
        .setLabel('Username หรือ Discord ID (คั่นด้วย , หรือ Enter)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('john_doe\njane_smith\n123456789012345678')
        .setRequired(true)
        .setMaxLength(4000);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    if (sub === 'members') {
      return handleRoleMembersCmd(interaction);
    }
  },
};
