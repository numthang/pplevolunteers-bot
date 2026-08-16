// commands/anon-context-menu.js
const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { showAnonModal } = require('../handlers/anonHandler');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('🎭 ข้อความไม่ระบุตัวตน')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    await showAnonModal(interaction);
  },
};
