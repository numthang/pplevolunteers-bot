// scripts/assignRoles.js assign user role จาก ฐานข้อมูล
require('dotenv').config();
const {Client, GatewayIntentBits} = require('discord.js');
const pool = require('../../db/index');
const {ROLES} = require('../../config/roles');

const GUILD_ID = process.env.GUILD_ID;
const DELAY_MS = 500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.members.fetch();

  // ดึงเฉพาะ record ที่ยังไม่เคย assign
  const [rows] = await pool.execute(
    'SELECT discord_id, username, roles FROM members WHERE roles IS NOT NULL AND roles != "" AND roles_assigned_at IS NULL'
  );

  console.log(`📦 พบ ${rows.length} members ที่ยังไม่ได้ assign roles`);

  let success = 0;
  let notFound = 0;
  let failed = 0;

  for (const row of rows) {
    const member = guild.members.cache.get(row.discord_id);

    if (!member) {
      console.log(`⚠️  ไม่พบใน server: ${row.discord_id} (${row.username})`);
      notFound++;
      continue;
    }

    const roleNames = row.roles.split(',').map((r) => r.trim()).filter(Boolean);
    const roleIds = roleNames.map((name) => ROLES[name]).filter(Boolean);

    if (roleIds.length === 0) {
      console.log(`⚠️  ไม่พบ role ID: ${row.username} — ${row.roles}`);
      continue;
    }

    try {
      await member.roles.add(roleIds);
      // บันทึกเวลาที่ assign
      await pool.execute(
        'UPDATE members SET roles_assigned_at = NOW() WHERE discord_id = ?',
        [row.discord_id]
      );
      console.log(`✅ ${row.username} — ${roleNames.join(', ')}`);
      success++;
    } catch (err) {
      console.error(`❌ ${row.discord_id} (${row.username}) — ${err.message}`);
      failed++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n🎉 เสร็จสิ้น: success ${success} | notFound ${notFound} | failed ${failed}`);
  process.exit(0);
});

client.login(process.env.TOKEN);
