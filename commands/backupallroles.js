const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backupallroles')
    .setDescription('Backup ทุก role และ members ทั้ง server ลงไฟล์'),

  async execute(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: '❌ ต้องการสิทธิ์ Administrator', ephemeral: true });
    }

    await interaction.deferReply();
    await interaction.guild.members.fetch();

    const backup = {};
    interaction.guild.roles.cache.forEach(role => {
      if (role.name === '@everyone') return;
      const members = interaction.guild.members.cache
        .filter(m => m.roles.cache.has(role.id))
        .map(m => ({ userId: m.user.id, username: m.user.username }));
      backup[role.name] = members;
    });

    fs.writeFileSync('backups/backup_roles.json', JSON.stringify(backup, null, 2));
    const roleCount = Object.keys(backup).length;
    return interaction.editReply(`✅ Backed up ${roleCount} roles to \`backup_roles.json\``);
  },
};