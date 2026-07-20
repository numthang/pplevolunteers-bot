/**
 * One-time sync: fetch all guild members from Discord → upsert into users + org_members
 * Run:  node scripts/calling/sync-discord-members.js <guildId> [--dry-run|--sql]
 *   --dry-run : print sample, ไม่เขียน db
 *   --sql     : เขียนไฟล์ .sql ลง logs/ (ไม่ต่อ db) แล้ว import ทีหลัง
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const pool = require('../../db/index');
const { getRolesByScopePrefix, getPickerRoles } = require('../../db/guildRoles');
const { upsertMember } = require('../../db/members');

const DRY_RUN = process.argv.includes('--dry-run');
const SQL_OUT = process.argv.includes('--sql');

async function buildRow(m, provinceRows, interestIds) {
  return {
    guild_id: m.guild.id,
    discord_id: m.id,
    username: m.user.username,
    display_name: m.displayName,
    province: provinceRows.filter(r => m.roles.cache.has(r.role_id)).map(r => r.scope_node.replace('province:', '')).join(',') || null,
    roles: m.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name).join(',') || null,
    interests: m.roles.cache.filter(r => interestIds.has(r.id)).map(r => r.name).join(',') || null,
  };
}

const sqlVal = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

// identity split: dc_members → users (identity) + org_members (membership per-guild)
// bulk import ต้องเป็น 2 statement → stage ลง TEMP TABLE ก่อน แล้ว upsert users → org_members
// org_id resolve จาก dc_guilds ในไฟล์ SQL เอง (ไม่ hardcode — prod/local เลข org อาจต่างกัน)
function buildSql(rows) {
  const guildId = rows[0]?.guild_id;
  const header = [
    '-- sync สมาชิก Discord → users + org_members (province/roles/interests จาก role)',
    `-- generated: ${new Date().toISOString()}  rows: ${rows.length}  guild: ${guildId}`,
    '-- import: sudo -u www bash -c \'cd /www/wwwroot/pple-volunteers && psql "$DATABASE_URL" -f <ไฟล์นี้>\'',
    '',
    'BEGIN;',
    'CREATE TEMP TABLE _sync (discord_id text, username text, display_name text, province text, roles text, interests text) ON COMMIT DROP;',
    'INSERT INTO _sync (discord_id, username, display_name, province, roles, interests) VALUES',
  ];
  const values = rows.map((r) =>
    `  (${sqlVal(r.discord_id)}, ${sqlVal(r.username)}, ${sqlVal(r.display_name)}, ${sqlVal(r.province)}, ${sqlVal(r.roles)}, ${sqlVal(r.interests)})`
  ).join(',\n') + ';';
  const footer = [
    '',
    '-- 1) identity',
    'INSERT INTO users (discord_id, username)',
    'SELECT discord_id, username FROM _sync',
    'ON CONFLICT (discord_id) WHERE discord_id IS NOT NULL DO UPDATE SET',
    '  username   = COALESCE(EXCLUDED.username, users.username),',
    '  updated_at = NOW();',
    '',
    '-- 2) membership + profile (per-guild)',
    'INSERT INTO org_members (user_id, org_id, guild_id, display_name, province, roles, interests)',
    'SELECT u.id,',
    `       (SELECT org_id FROM dc_guilds WHERE guild_id = ${sqlVal(guildId)}),`,
    `       ${sqlVal(guildId)},`,
    '       s.display_name, s.province, s.roles, s.interests',
    '  FROM _sync s JOIN users u ON u.discord_id = s.discord_id',
    'ON CONFLICT (user_id, guild_id) WHERE guild_id IS NOT NULL DO UPDATE SET',
    '  org_id            = COALESCE(EXCLUDED.org_id, org_members.org_id),',
    '  display_name      = EXCLUDED.display_name,',
    '  province          = EXCLUDED.province,',
    '  roles             = EXCLUDED.roles,',
    '  interests         = EXCLUDED.interests,',
    '  roles_assigned_at = NOW();',
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

  const [provinceRows, interestRows, skillRows] = await Promise.all([
    getRolesByScopePrefix(guildId, 'province:'),
    getPickerRoles(guildId, 'interest'),
    getPickerRoles(guildId, 'skill'),
  ]);
  const interestIds = new Set([...interestRows, ...skillRows].map(r => r.roleId));

  if (DRY_RUN) {
    console.log(`✅ DRY-RUN: would upsert ${total} members:`);
    for (const m of humans) console.log(`  ${m.user.username} | ${m.displayName} (${m.id})`);
    process.exit(0);
  }

  if (SQL_OUT) {
    const rows = await Promise.all(humans.map(m => buildRow(m, provinceRows, interestIds)));
    const logDir = path.join(__dirname, '../../logs');
    fs.mkdirSync(logDir, { recursive: true });
    const file = path.join(logDir, `sync-members-${guildId}-${Date.now()}.sql`);
    fs.writeFileSync(file, buildSql(rows));
    console.log(`\n✅ wrote ${rows.length} rows → ${file}`);
    process.exit(0);
  }

  let done = 0, errors = 0;
  for (const m of humans) {
    const r = await buildRow(m, provinceRows, interestIds);
    try {
      await upsertMember(r.guild_id, r);   // 2 จังหวะ users → org_members (db/members.js)
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
