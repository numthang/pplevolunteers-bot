// commands/role.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} = require('discord.js');
const { handleRoleMembersCmd, handleRoleByRoleCmd } = require('../handlers/roleBulkHandler');

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
    )

    .addSubcommand(sub =>
      sub.setName('recover')
        .setDescription('คืน role หลายอันให้สมาชิกคนเดียว — Admin เท่านั้น')
        .addUserOption(opt => opt.setName('user').setDescription('สมาชิกที่จะคืน role ให้').setRequired(true))
    )

    .addSubcommand(sub =>
      sub.setName('by-role')
        .setDescription('เลือกสมาชิกจาก role ที่ชื่อมี keyword แล้วเพิ่ม/ถอด/แทนที่ role')
        .addStringOption(opt => opt.setName('keyword').setDescription('คำในชื่อ role ที่ใช้เลือกกลุ่มเป้าหมาย (เช่น นครปฐม)').setRequired(true))
        .addStringOption(opt => opt.setName('action').setDescription('จะทำอะไรกับคนที่เข้าเงื่อนไข').setRequired(true)
          .addChoices(
            { name: 'เพิ่ม role', value: 'add' },
            { name: 'ถอด role', value: 'remove' },
            { name: 'แทนที่ (เพิ่ม role + ถอด role ที่ match keyword)', value: 'replace' },
          ))
        .addRoleOption(opt => opt.setName('role1').setDescription('Role ที่จะเพิ่ม/ถอด (อันที่ 1)').setRequired(true))
        .addRoleOption(opt => opt.setName('role2').setDescription('Role ที่ 2').setRequired(false))
        .addRoleOption(opt => opt.setName('role3').setDescription('Role ที่ 3').setRequired(false))
        .addRoleOption(opt => opt.setName('role4').setDescription('Role ที่ 4').setRequired(false))
        .addRoleOption(opt => opt.setName('role5').setDescription('Role ที่ 5').setRequired(false))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // กัน Moderator แจก/ถอด role ที่สูงกว่า role สูงสุดของตัวเอง (privilege escalation)
    function findTooHighRoles(roles) {
      if (interaction.guild.ownerId === interaction.user.id) return [];
      const myTop = interaction.member.roles.highest.position;
      return roles.filter(r => r.position >= myTop);
    }

    if (sub === 'add') {
      const roles = ['role1','role2','role3','role4','role5']
        .map(k => interaction.options.getRole(k))
        .filter(Boolean);

      const tooHigh = findTooHighRoles(roles);
      if (tooHigh.length > 0) {
        return interaction.reply({
          content: `❌ คุณไม่มีสิทธิ์แจก role ที่สูงกว่าหรือเท่ากับ role สูงสุดของคุณเอง: ${tooHigh.map(r => `**${r.name}**`).join(', ')}`,
          flags: MessageFlags.Ephemeral,
        });
      }

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

      const tooHigh = findTooHighRoles(roles);
      if (tooHigh.length > 0) {
        return interaction.reply({
          content: `❌ คุณไม่มีสิทธิ์ถอด role ที่สูงกว่าหรือเท่ากับ role สูงสุดของคุณเอง: ${tooHigh.map(r => `**${r.name}**`).join(', ')}`,
          flags: MessageFlags.Ephemeral,
        });
      }

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

    if (sub === 'by-role') {
      return handleRoleByRoleCmd(interaction);
    }

    if (sub === 'recover') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ ต้องมีสิทธิ์ **Administrator** ถึงจะคืน role ได้ครับ', flags: MessageFlags.Ephemeral });
      }

      const target = interaction.options.getUser('user');

      const modal = new ModalBuilder()
        .setCustomId(`role_recover_modal:${target.id}`)
        .setTitle(`คืน Role: ${target.username}`);

      const input = new TextInputBuilder()
        .setCustomId('role_names')
        .setLabel('ชื่อ Role (คั่น , หรือ Enter)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('ทีมกระบวนกร\nทีมนครปฐม\nSupervisor')
        .setRequired(true)
        .setMaxLength(4000);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }
  },
};
