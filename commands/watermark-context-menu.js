// commands/watermark-context-menu.js
const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { handleWatermarkCommand } = require('../handlers/watermarkHandler');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('💧 ติดลายน้ำ')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    await handleWatermarkCommand(interaction);
  },
};
