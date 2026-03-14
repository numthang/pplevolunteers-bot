// commands/register.js
const {SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle} = require('discord.js');
const {getMember} = require('../db/members');
const {buildRegisterModal} = require('../handlers/registerHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('ลงทะเบียนสมาชิก')
    .addStringOption(option =>
      option
        .setName('mode')
        .setDescription('วิธีลงทะเบียน')
        .setRequired(false)
        .addChoices(
          {name: 'Modal (default)', value: 'modal'},
          {name: 'Button', value: 'button'},
        )
    ),

  async execute(interaction) {
    const existing = await getMember(interaction.user.id);
    const mode = interaction.options.getString('mode') ?? 'modal';

    if (mode === 'modal') {
      await interaction.showModal(buildRegisterModal(existing));
    } else {
      await interaction.reply({
        content: 'กดปุ่มด้านล่างเพื่อเริ่มลงทะเบียนครับ',
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('btn_open_register_modal')
              .setLabel('📋 ลงทะเบียน')
              .setStyle(ButtonStyle.Primary)
          ),
        ],
        ephemeral: true,
      });
    }
  },
};
