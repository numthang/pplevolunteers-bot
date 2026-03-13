const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restorerole')
    .setDescription('Restore role ที่ระบุจาก backup')
    .addStringOption(option =>
      option.setName('rolename')
        .setDescription('ชื่อ role ที่ต้องการ restore')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: '❌ ต้องการสิทธิ์ Administrator', ephemeral: true });
    }

    await interaction.deferReply();
    const roleName = interaction.options.getString('rolename');

    if (!fs.existsSync('backup_roles.json')) {
      return interaction.editReply('❌ ไม่พบไฟล์ backup_roles.json');
    }

    const backup = JSON.parse(fs.readFileSync('backup_roles.json'));
    if (!backup[roleName]) {
      return interaction.editReply(`❌ ไม่พบ role ชื่อ "${roleName}" ใน backup`);
    }

    const role = interaction.guild.roles.cache.find(r => r.name === roleName);
    if (!role) {
      return interaction.editReply(`❌ ไม่พบ role "${roleName}" ใน server ตอนนี้ สร้าง role นี้ก่อนแล้วลองใหม่`);
    }

    const users = backup[roleName];
    let success = 0, failed = 0;

    for (const entry of users) {
      try {
        const member = await interaction.guild.members.fetch(entry.userId);
        await member.roles.add(role.id);
        success++;
      } catch (e) {
        failed++;
        console.log(`Skip ${entry.username} (${entry.userId}): ${e.message}`);
      }
    }

    return interaction.editReply(`✅ Restored "${roleName}" → ${success} คน สำเร็จ, ${failed} คน ข้ามไป`);
  },
};