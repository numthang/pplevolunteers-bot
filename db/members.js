const pool = require('./index');
const { PROVINCE_ROLES, INTEREST_ROLES, SKILL_ROLES } = require('../config/roles');

async function upsertMember(guildId, data) {
  const sql = `
  INSERT INTO dc_members
    (guild_id, discord_id, username, display_name, nickname, firstname, lastname, member_id, specialty, position, amphoe, province, region, roles, interests, referred_by)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
  ON CONFLICT (guild_id, discord_id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    nickname = EXCLUDED.nickname,
    firstname = EXCLUDED.firstname,
    lastname = EXCLUDED.lastname,
    member_id = EXCLUDED.member_id,
    specialty = EXCLUDED.specialty,
    position = EXCLUDED.position,
    amphoe = EXCLUDED.amphoe,
    province = EXCLUDED.province,
    region = EXCLUDED.region,
    roles = EXCLUDED.roles,
    interests = EXCLUDED.interests,
    referred_by = EXCLUDED.referred_by,
    updated_at = CURRENT_TIMESTAMP
  `;
  const values = [
    guildId,
    data.discord_id,
    data.username,
    data.display_name ?? null,
    data.nickname ?? null,
    data.firstname ?? null,
    data.lastname ?? null,
    data.member_id ?? null,
    data.specialty ?? null,
    data.position ?? null,
    data.amphoe ?? null,
    data.province ?? null,
    data.region ?? null,
    data.roles ?? null,
    data.interests ?? null,
    data.referred_by ?? null,
  ];
  await pool.query(sql, values);
}

async function upsertMemberFromDiscord(member) {
  const { PROVINCE_ROLES, INTEREST_ROLES, SKILL_ROLES } = require('../config/roles');

  await member.fetch();

  const allProvinces = Object.entries(PROVINCE_ROLES)
    .filter(([, roleId]) => member.roles.cache.has(roleId))
    .map(([province]) => province)
    .join(',') || null;

  const allRoles = member.roles.cache
    .filter(r => r.name !== '@everyone')
    .map(r => r.name)
    .join(',') || null;

  const interestIds = new Set([
    ...Object.values(SKILL_ROLES),
    ...Object.values(INTEREST_ROLES),
  ]);
  const interestRoles = member.roles.cache
    .filter(r => interestIds.has(r.id))
    .map(r => r.name)
    .join(',') || null;

  const sql = `
  INSERT INTO dc_members
    (guild_id, discord_id, username, display_name, province, roles, interests)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (guild_id, discord_id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    province = EXCLUDED.province,
    roles = EXCLUDED.roles,
    interests = EXCLUDED.interests,
    updated_at = CURRENT_TIMESTAMP
  `;
  await pool.query(sql, [
    member.guild.id,
    member.id,
    member.user.username,
    member.displayName,
    allProvinces,
    allRoles,
    interestRoles,
  ]);
}

async function getMember(guildId, discord_id) {
  const { rows } = await pool.query(
    'SELECT * FROM dc_members WHERE guild_id = $1 AND discord_id = $2',
    [guildId, discord_id]
  );
  return rows[0] ?? null;
}

async function syncMemberRoles(member) {
  await member.fetch();

  const guildId = member.guild.id;

  const allProvinces = Object.entries(PROVINCE_ROLES)
    .filter(([, roleId]) => member.roles.cache.has(roleId))
    .map(([province]) => province);

  const allRoles = member.roles.cache
    .filter(r => r.name !== '@everyone')
    .map(r => r.name)
    .join(',');

  const interestIds = new Set([
    ...Object.values(SKILL_ROLES),
    ...Object.values(INTEREST_ROLES),
  ]);

  const interestRoles = member.roles.cache
    .filter(r => interestIds.has(r.id))
    .map(r => r.name)
    .join(',');

  await pool.query(
    'UPDATE dc_members SET province = $1, roles = $2, interests = $3, updated_at = CURRENT_TIMESTAMP WHERE guild_id = $4 AND discord_id = $5',
    [allProvinces.join(',') || null, allRoles || null, interestRoles || null, guildId, member.id]
  );
}

module.exports = { upsertMember, upsertMemberFromDiscord, getMember, syncMemberRoles };
