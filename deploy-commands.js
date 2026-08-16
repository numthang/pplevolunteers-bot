// deploy-commands.js
// node deploy-commands.js                          → deploy ทุก guild ใน DB  ← ใช้ตัวนี้เป็นหลัก
// node deploy-commands.js --guild <guildId>        → deploy guild ที่ระบุ
// node deploy-commands.js --clear                  → ลบ guild commands ทุก guild
// node deploy-commands.js --clear-global           → ลบ global commands ทิ้ง
// node deploy-commands.js --global                 → ⚠️ อย่าใช้ (ดูหมายเหตุ)
//
// ⚠️ ห้ามมี commands ทั้ง global และ guild-level พร้อมกัน
// Discord ไม่ merge สอง scope นี้ มันโชว์ทั้งคู่ → เมนูเบิ้ลทุก client ทุกเครื่อง
// โปรเจกต์นี้ใช้ guild-level อย่างเดียว เพราะเปลี่ยนทันที (global รอ propagate ถึง 1 ชม.)
// guild ทั้งหมดมาจาก dc_guilds ที่ upsertGuilds() ใน index.js sync ให้เองตอนบอท ready

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const pool = require('./db/index');

const isGlobal      = process.argv.includes('--global');
const isClear       = process.argv.includes('--clear');
const isClearGlobal = process.argv.includes('--clear-global');
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
    if (isClearGlobal) {
      console.log('\n🗑️  กำลังลบ global commands...');
      await rest.put(Routes.applicationCommands(process.env.DISCORD_BOT_CLIENT_ID), { body: [] });
      console.log('✅ ลบ global commands แล้ว — guild-level เป็นแหล่งเดียว (Discord อาจใช้เวลาถึง 1 ชม. กว่าของเก่าจะหายจากทุก client)');
    } else if (isClear) {
      const targets = singleGuildId ? [{ guild_id: singleGuildId, name: singleGuildId }]
        : (await pool.query('SELECT guild_id, name FROM dc_guilds ORDER BY name')).rows;
      console.log(`\n🗑️  กำลังลบ guild commands ออกจาก ${targets.length} guilds...`);
      for (const g of targets) {
        await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_BOT_CLIENT_ID, g.guild_id), { body: [] });
        console.log(`✅ cleared: ${g.name} (${g.guild_id})`);
      }
      console.log('✅ ลบ guild commands ทั้งหมดแล้ว');
    } else if (isGlobal) {
      console.log('\n⚠️  --global ทำให้เมนูเบิ้ลถ้ามี guild commands อยู่ด้วย — โปรเจกต์นี้ใช้ guild-level อย่างเดียว');
      console.log('    ถ้ายืนยันจริงให้ใส่ --force-global ด้วย');
      if (!process.argv.includes('--force-global')) return; // finally ปิด pool ให้เอง
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
      let failed = 0;
      for (const guild of rows) {
        // guild ใน DB อาจนำหน้า bot (pre-seed org) — 50001 Missing Access ต้องไม่ล้ม guild ที่เหลือ
        try {
          await rest.put(
            Routes.applicationGuildCommands(process.env.DISCORD_BOT_CLIENT_ID, guild.guild_id),
            { body: commands }
          );
          console.log(`✅ ${guild.name} (${guild.guild_id})`);
        } catch (err) {
          failed++;
          console.error(`❌ ${guild.name} (${guild.guild_id}): ${err.message}${err.code === 50001 ? ' — bot ยังไม่ได้ invite เข้า server นี้' : ''}`);
        }
      }
      console.log(failed ? `⚠️  สำเร็จ ${rows.length - failed}/${rows.length} guilds` : '✅ Deploy ทุก guild สำเร็จ!');
    }
  } catch (err) {
    console.error('❌ Deploy ไม่สำเร็จ:', err);
  } finally {
    await pool.end();
  }
})();