// deploy-commands.js
// node deploy-commands.js                          → deploy ทุก guild ใน DB
// node deploy-commands.js --guild <guildId>        → deploy guild ที่ระบุ
// node deploy-commands.js --global                 → deploy global (ทุก server, รอ ~1 ชม.)

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const pool = require('./db/index');

const isGlobal   = process.argv.includes('--global');
const guildIndex = process.argv.indexOf('--guild');
const singleGuildId = guildIndex !== -1 ? process.argv[guildIndex + 1] : null;

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

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    if (isGlobal) {
      console.log(`\n🚀 กำลัง deploy ${commands.length} commands (global)...`);
      await rest.put(
        Routes.applicationCommands(process.env.DISCORD_BOT_CLIENT_ID),
        { body: commands }
      );
      console.log('✅ Deploy global สำเร็จ! (อาจใช้เวลาถึง 1 ชั่วโมงกว่าจะอัปเดตใน Discord)');
    } else if (singleGuildId) {
      console.log(`\n🚀 กำลัง deploy ${commands.length} commands (guild: ${singleGuildId})...`);
      await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_BOT_CLIENT_ID, singleGuildId),
        { body: commands }
      );
      console.log('✅ Deploy guild สำเร็จ!');
    } else {
      const { rows } = await pool.query('SELECT guild_id, name FROM dc_guilds ORDER BY name');
      console.log(`\n🚀 กำลัง deploy ${commands.length} commands ไปยัง ${rows.length} guilds...`);
      for (const guild of rows) {
        await rest.put(
          Routes.applicationGuildCommands(process.env.DISCORD_BOT_CLIENT_ID, guild.guild_id),
          { body: commands }
        );
        console.log(`✅ ${guild.name} (${guild.guild_id})`);
      }
      console.log('✅ Deploy ทุก guild สำเร็จ!');
    }
  } catch (err) {
    console.error('❌ Deploy ไม่สำเร็จ:', err);
  } finally {
    await pool.end();
  }
})();