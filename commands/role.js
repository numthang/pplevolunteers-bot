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
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)

    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('เพิ่ม role ให้สมาชิกทีละหลายคน')
        .addRoleOption(opt => opt.setName('role1').setDescription('Role ที่ 1').setRequired(true))
        .addRoleOption(opt => opt.setName('role2').setDescription('Role ที่ 2').setRequired(false))
        .addRoleOption(opt => opt.setName('role3').setDescription('Role ที่ 3').setRequired(false))
        .addRoleOption(opt => opt.setName('role4').setDescription('Role ที่ 4').setRequired(false))
        .addRoleOption(opt => opt.setName('role5').setDescription('Role ที่ 5').setRequired(false))
    )

    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('ถอด role ออกจากสมาชิกทีละหลายคน')
        .addRoleOption(opt => opt.setName('role1').setDescription('Role ที่ 1').setRequired(true))
        .addRoleOption(opt => opt.setName('role2').setDescription('Role ที่ 2').setRequired(false))
        .addRoleOption(opt => opt.setName('role3').setDescription('Role ที่ 3').setRequired(false))
        .addRoleOption(opt => opt.setName('role4').setDescription('Role ที่ 4').setRequired(false))
        .addRoleOption(opt => opt.setName('role5').setDescription('Role ที่ 5').setRequired(false))
    )

    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('แสดงรายชื่อสมาชิกทั้งหมดใน role')
        .addRoleOption(opt => opt.setName('role1').setDescription('Role ที่ 1').setRequired(true))
        .addRoleOption(opt => opt.setName('role2').setDescription('Role ที่ 2').setRequired(false))
        .addRoleOption(opt => opt.setName('role3').setDescription('Role ที่ 3').setRequired(false))
        .addRoleOption(opt => opt.setName('role4').setDescription('Role ที่ 4').setRequired(false))
        .addRoleOption(opt => opt.setName('role5').setDescription('Role ที่ 5').setRequired(false))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const roles = ['role1','role2','role3','role4','role5']
        .map(k => interaction.options.getRole(k))
        .filter(Boolean);

      const modal = new ModalBuilder()
        .setCustomId(`role_add_modal:${roles.map(r => r.id).join(',')}`)
        .setTitle(roles.length === 1 ? `เพิ่ม Role: ${roles[0].name}` : `เพิ่ม ${roles.length} Roles`);

      const input = new TextInputBuilder()
        .setCustomId('role_usernames')
        .setLabel('Username หรือ ID (คั่น , หรือ Enter)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('john_doe\njane_smith\n123456789012345678')
        .setRequired(true)
        .setMaxLength(4000);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    if (sub === 'remove') {
      const roles = ['role1','role2','role3','role4','role5']
        .map(k => interaction.options.getRole(k))
        .filter(Boolean);

      const modal = new ModalBuilder()
        .setCustomId(`role_remove_modal:${roles.map(r => r.id).join(',')}`)
        .setTitle(roles.length === 1 ? `ถอด Role: ${roles[0].name}` : `ถอด ${roles.length} Roles`);

      const input = new TextInputBuilder()
        .setCustomId('role_usernames')
        .setLabel('Username หรือ ID (คั่น , หรือ Enter)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('john_doe\njane_smith\n123456789012345678')
        .setRequired(true)
        .setMaxLength(4000);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    if (sub === 'list') {
      return handleRoleMembersCmd(interaction);
    }
  },
};
