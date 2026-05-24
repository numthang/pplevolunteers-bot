// commands/quote-context-menu.js
const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { handleQuoteCommand } = require('../handlers/quoteHandler');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('💬 Quote Image')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    await handleQuoteCommand(interaction);
  },
};
