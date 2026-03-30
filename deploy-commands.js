// deploy-commands.js
// node deploy-commands.js          → deploy guild (local dev)
// node deploy-commands.js --global → deploy global (ทุก server)

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const isGlobal = process.argv.includes('--global');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data) {
    commands.push(command.data.toJSON());
    console.log(`✅ โหลด command: ${command.data.name}`);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log(`\n🚀 กำลัง deploy ${commands.length} commands (${isGlobal ? 'global' : 'guild'})...`);

    if (isGlobal) {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log('✅ Deploy global สำเร็จ! (อาจใช้เวลาถึง 1 ชั่วโมงกว่าจะอัปเดตใน Discord)');
    } else {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log('✅ Deploy guild สำเร็จ!');
    }
  } catch (err) {
    console.error('❌ Deploy ไม่สำเร็จ:', err);
  }
})();
