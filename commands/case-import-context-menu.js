const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits } = require('discord.js');
const { handleCaseImportStart } = require('../handlers/caseImportHandler');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('📋 นำเข้าเป็นเคสร้องเรียน')
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await handleCaseImportStart(interaction);
  },
};
