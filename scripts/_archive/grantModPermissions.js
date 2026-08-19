// scripts/roles/grantModPermissions.js
// one-off: เพิ่มสิทธิ์ Ban Members + Kick Members ให้ role "Moderator" ผ่านสิทธิ์ Admin ของบอท
require('dotenv').config();
const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');

const GUILD_ID   = process.argv[2] || process.env.GUILD_ID;
const ROLE_NAME  = 'Moderator';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch();

  const role = guild.roles.cache.find(r => r.name.toLowerCase() === ROLE_NAME.toLowerCase());
  if (!role) {
    console.error(`❌ ไม่พบ role ชื่อ "${ROLE_NAME}" ใน guild ${GUILD_ID}`);
    return process.exit(1);
  }

  console.log(`🔎 พบ role: ${role.name} (${role.id})`);
  console.log(`   สิทธิ์เดิม: BanMembers=${role.permissions.has(PermissionFlagsBits.BanMembers)}, KickMembers=${role.permissions.has(PermissionFlagsBits.KickMembers)}`);

  const updated = role.permissions.add([
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
  ]);

  const savedRole = await role.setPermissions(updated, 'grantModPermissions.js — เพิ่มสิทธิ์ ban/kick ให้ moderator');

  console.log(`✅ เพิ่มสิทธิ์สำเร็จ: BanMembers=${savedRole.permissions.has(PermissionFlagsBits.BanMembers)}, KickMembers=${savedRole.permissions.has(PermissionFlagsBits.KickMembers)}`);
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);
