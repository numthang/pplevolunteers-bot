// scripts/syncAllMembers.js
require('dotenv').config();
const {Client, GatewayIntentBits} = require('discord.js');
const pool = require('../db/index');
const {PROVINCE_ROLES, INTEREST_ROLES, SKILL_ROLES} = require('../config/roles');

const GUILD_ID = process.env.GUILD_ID;
const DELAY_MS = 100;
const DRY_RUN = process.argv.includes('--dry-run');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EXCLUDE_ROLES = new Set(['@everyone', 'Admin', 'Xenon', 'Wick', 'Forms', 'Sapphire', 'Test Bot', 'Roler', 'PPLEVolunteers']);

const ROLE_ID_TO_PROVINCE = Object.fromEntries(
  Object.entries(PROVINCE_ROLES).map(([province, id]) => [id, province])
);

const INTEREST_ROLE_IDS = new Set([
  ...Object.values(INTEREST_ROLES),
  ...Object.values(SKILL_ROLES),
]);

const ROLE_ID_TO_INTEREST = Object.fromEntries([
  ...Object.entries(INTEREST_ROLES).map(([name, id]) => [id, name]),
  ...Object.entries(SKILL_ROLES).map(([name, id]) => [id, name]),
]);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  if (DRY_RUN) console.log(`⚠️  DRY RUN mode — ไม่มีการ upsert DB จริง\n`);

  const guild = await client.guilds.fetch(GUILD_ID);
  const members = await guild.members.fetch();

  console.log(`📦 พบ ${members.size} members ใน server\n`);

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const [, member] of members) {
    if (member.user.bot) continue;

    const provinces = [];
    const interests = [];
    const allRoles = [];

    for (const [id, role] of member.roles.cache) {
      if (EXCLUDE_ROLES.has(role.name)) continue;
      allRoles.push(role.name);
      if (ROLE_ID_TO_PROVINCE[id]) provinces.push(ROLE_ID_TO_PROVINCE[id]);
      if (INTEREST_ROLE_IDS.has(id)) interests.push(ROLE_ID_TO_INTEREST[id]);
    }

    console.log(`${DRY_RUN ? '[DRY RUN]' : '✅'} ${member.user.username} (${member.id})`);
    console.log(`  roles:     ${allRoles.join(', ') || '-'}`);
    console.log(`  province:  ${provinces.join(', ') || '-'}`);
    console.log(`  interests: ${interests.join(', ') || '-'}`);

    if (!DRY_RUN) {
      try {
        const [result] = await pool.execute(`
          INSERT INTO members (discord_id, username, roles, province, interests, roles_assigned_at)
          VALUES (?, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            username          = VALUES(username),
            roles             = VALUES(roles),
            province          = VALUES(province),
            interests         = VALUES(interests),
            roles_assigned_at = COALESCE(roles_assigned_at, NOW()),
            updated_at        = CURRENT_TIMESTAMP
        `, [
          member.id,
          member.user.username,
          allRoles.join(', ') || null,
          provinces.join(', ') || null,
          interests.join(', ') || null,
        ]);

        if (result.affectedRows === 1) inserted++;
        else updated++;

      } catch (err) {
        console.error(`❌ ${member.id} (${member.user.username}) — ${err.message}`);
        failed++;
      }
    } else {
      inserted++; // นับเป็น dry-run count
    }

    await sleep(DELAY_MS);
  }

  const label = DRY_RUN ? 'dry-run' : `inserted ${inserted} | updated ${updated} | failed ${failed}`;
  console.log(`\n🎉 เสร็จสิ้น: ${DRY_RUN ? `would process ${inserted}` : label}`);
  process.exit(0);
});

client.login(process.env.TOKEN);
