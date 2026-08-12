const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits } = require('discord.js');
const { handlePostImportStart } = require('../handlers/postImportHandler');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('📝 นำเข้าเป็นโพสต์')
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await handlePostImportStart(interaction);
  },
};
