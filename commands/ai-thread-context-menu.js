const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { handleAiThreadStart } = require('../handlers/aiThreadHandler');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('🤖 AI สรุปเธรด')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    await handleAiThreadStart(interaction);
  },
};
