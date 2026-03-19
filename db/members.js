const pool = require('./index');
const { PROVINCE_ROLES, INTEREST_ROLES, SKILL_ROLES } = require('../config/roles');

async function upsertMember(data) {
  const sql = `
  INSERT INTO members
    (discord_id, username, nickname, firstname, lastname, member_id, specialty, province, region, roles, interests, referred_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    username = VALUES(username),
    nickname = VALUES(nickname),
    firstname = VALUES(firstname),
    lastname = VALUES(lastname),
    member_id = VALUES(member_id),
    specialty = VALUES(specialty),
    province = VALUES(province),
    region = VALUES(region),
    roles = VALUES(roles),
    interests = VALUES(interests),
    referred_by = VALUES(referred_by),
    updated_at = CURRENT_TIMESTAMP
  `;
  const values = [
    data.discord_id,
    data.username,
    data.nickname ?? null,
    data.firstname ?? null,
    data.lastname ?? null,
    data.member_id ?? null,
    data.specialty ?? null,
    data.province ?? null,
    data.region ?? null,
    data.roles ?? null,
    data.interests ?? null,
    data.referred_by ?? null,
  ];
  await pool.execute(sql, values);
}

async function getMember(discord_id) {
  const [rows] = await pool.execute(
    'SELECT * FROM members WHERE discord_id = ?',
    [discord_id]
  );
  return rows[0] ?? null;
}

/*async function updateProvince(discord_id, province) {
  await pool.execute(
    'UPDATE members SET province = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?',
    [province, discord_id]
  );
}

async function updateInterests(discord_id, interests) {
  await pool.execute(
    'UPDATE members SET interests = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?',
    [interests, discord_id]
  );
}*/

async function syncMemberRoles(member) {
  await member.fetch();

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

  await pool.execute(
    'UPDATE members SET province = ?, roles = ?, interests = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?',
    [allProvinces.join(',') || null, allRoles || null, interestRoles || null, member.id]
  );
}

module.exports = { upsertMember, getMember, syncMemberRoles };