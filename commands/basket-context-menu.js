const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { handleBasketAdd } = require('../handlers/basketHandler');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('🧺 หยิบลงตะกร้า')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    await handleBasketAdd(interaction);
  },
};
