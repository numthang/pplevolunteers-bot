const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { handleBasketView } = require('../handlers/basketHandler');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('🧺 ดูตะกร้าสื่อ')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    await handleBasketView(interaction);
  },
};
