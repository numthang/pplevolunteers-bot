// deploy-commands.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

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
    console.log(`\n🚀 กำลัง deploy ${commands.length} commands...`);

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID), // global — ใช้ได้ทุก server
      { body: commands }
    );

    console.log('✅ Deploy สำเร็จ! (อาจใช้เวลาถึง 1 ชั่วโมงกว่า commands จะอัปเดตใน Discord)');
  } catch (err) {
    console.error('❌ Deploy ไม่สำเร็จ:', err);
  }
})();
