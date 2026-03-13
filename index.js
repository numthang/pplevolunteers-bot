require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { handleInterestSelect } = require('./handlers/interestSelect');
const { handleModalSubmit, handleProvinceDropdown, handleRegisterConfirm, handleDeleteLog } = require('./handlers/registerHandler');
const { handleProvinceBtn } = require('./handlers/provinceSelect');

const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // ← เพิ่มบรรทัดนี้
  ]
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    console.log(`✅ โหลด command: ${command.data.name}`);
  }
}

client.once('ready', () => {
  console.log(`🤖 Bot พร้อมแล้ว! ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  // --- Slash Commands ---
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(err);
      const msg = { content: '❌ เกิดข้อผิดพลาด', ephemeral: true };
      interaction.replied ? interaction.followUp(msg) : interaction.reply(msg);
    }
    return;
  }

  // --- Modal Submit ---
  if (interaction.isModalSubmit()) {
    await handleModalSubmit(interaction);
    return;
  }

  // --- Select Menus ---
  if (interaction.isStringSelectMenu()) {
    await handleProvinceDropdown(interaction); // dropdown จังหวัด (register)
    await handleInterestSelect(interaction);   // interest/skill
    return;
  }

  // --- Buttons ---
  if (interaction.isButton()) {
    await handleRegisterConfirm(interaction);  // ปุ่มยืนยัน log
    await handleInterestSelect(interaction);   // ปุ่ม interest/skill toggle
    await handleDeleteLog(interaction);
    await handleProvinceBtn(interaction);
    return;
  }
});

client.login(process.env.TOKEN);

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
