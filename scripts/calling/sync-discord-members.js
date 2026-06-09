/**
 * One-time sync: fetch all guild members from Discord → upsert into dc_members
 * Run:  node scripts/calling/sync-discord-members.js <guildId> [--dry-run|--sql]
 *   --dry-run : print sample, ไม่เขียน db
 *   --sql     : เขียนไฟล์ .sql ลง logs/ (ไม่ต่อ db) แล้ว import ทีหลัง
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const pool = require('../../db/index');
const { PROVINCE_ROLES, INTEREST_ROLES, SKILL_ROLES } = require('../../config/roles');

const DRY_RUN = process.argv.includes('--dry-run');
const SQL_OUT = process.argv.includes('--sql');

const interestIds = new Set([...Object.values(SKILL_ROLES), ...Object.values(INTEREST_ROLES)]);

function buildRow(m) {
  return {
    guild_id: m.guild.id,
    discord_id: m.id,
    username: m.user.username,
    display_name: m.displayName,
    province: Object.entries(PROVINCE_ROLES).filter(([, id]) => m.roles.cache.has(id)).map(([p]) => p).join(',') || null,
    roles: m.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name).join(',') || null,
    interests: m.roles.cache.filter(r => interestIds.has(r.id)).map(r => r.name).join(',') || null,
  };
}

const UPSERT_SQL = `
  INSERT INTO dc_members (guild_id, discord_id, username, display_name, province, roles, interests)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (guild_id, discord_id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    province = EXCLUDED.province,
    roles = EXCLUDED.roles,
    interests = EXCLUDED.interests,
    updated_at = CURRENT_TIMESTAMP
`;

const sqlVal = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

function buildSql(rows) {
  const header = [
    '-- sync dc_members จาก Discord guild (province/roles/interests จาก role)',
    `-- generated: ${new Date().toISOString()}  rows: ${rows.length}`,
    '-- import: sudo -u www bash -c \'cd /www/wwwroot/pple-volunteers && psql "$DATABASE_URL" -f <ไฟล์นี้>\'',
    '',
    'BEGIN;',
    'INSERT INTO dc_members',
    '  (guild_id, discord_id, username, display_name, province, roles, interests)',
    'VALUES',
  ];
  const values = rows.map((r) =>
    `  (${sqlVal(r.guild_id)}, ${sqlVal(r.discord_id)}, ${sqlVal(r.username)}, ${sqlVal(r.display_name)}, ${sqlVal(r.province)}, ${sqlVal(r.roles)}, ${sqlVal(r.interests)})`
  ).join(',\n');
  const footer = [
    'ON CONFLICT (guild_id, discord_id) DO UPDATE SET',
    '  username = EXCLUDED.username,',
    '  display_name = EXCLUDED.display_name,',
    '  province = EXCLUDED.province,',
    '  roles = EXCLUDED.roles,',
    '  interests = EXCLUDED.interests,',
    '  updated_at = CURRENT_TIMESTAMP;',
    'COMMIT;',
    '',
  ];
  return `${header.join('\n')}\n${values}\n${footer.join('\n')}`;
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const guildId = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.GUILD_ID;
  if (!guildId) {
    console.error('ERROR: ระบุ guild id — node scripts/calling/sync-discord-members.js <guildId> [--dry-run]');
    process.exit(1);
  }
  console.log(`Guild: ${guildId}${DRY_RUN ? '  (DRY-RUN — ไม่เขียน db)' : ''}`);
  const guild = await client.guilds.fetch(guildId);
  console.log(`Guild name: ${guild.name}`);
  const members = await guild.members.fetch();

  const humans = [...members.values()].filter(m => !m.user.bot)
  const total = humans.length
  console.log(`Fetched ${members.size} members (${total} non-bot)${DRY_RUN ? '' : ', upserting...'}`);

  if (DRY_RUN) {
    console.log(`✅ DRY-RUN: would upsert ${total} members:`);
    for (const m of humans) console.log(`  ${m.user.username} | ${m.displayName} (${m.id})`);
    process.exit(0);
  }

  if (SQL_OUT) {
    const rows = humans.map(buildRow);
    const logDir = path.join(__dirname, '../../logs');
    fs.mkdirSync(logDir, { recursive: true });
    const file = path.join(logDir, `sync-members-${guildId}-${Date.now()}.sql`);
    fs.writeFileSync(file, buildSql(rows));
    console.log(`\n✅ wrote ${rows.length} rows → ${file}`);
    process.exit(0);
  }

  let done = 0, errors = 0;
  for (const m of humans) {
    const r = buildRow(m);
    try {
      await pool.query(UPSERT_SQL, [r.guild_id, r.discord_id, r.username, r.display_name, r.province, r.roles, r.interests]);
      done++;
    } catch (err) {
      console.error(`  ✗ ${m.user.username}: ${err.message}`);
      errors++;
    }
    if ((done + errors) % 10 === 0 || done + errors === total) {
      process.stdout.write(`\r  ${done + errors}/${total} (${errors} errors)`);
    }
  }

  console.log(`\nDone: ${done} upserted, ${errors} errors`);
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);
