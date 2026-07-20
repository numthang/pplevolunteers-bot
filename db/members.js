const pool = require('./index');
const { getRolesByScopePrefix, getPickerRoles } = require('./guildRoles');
const { orgIdOfGuild, upsertUserByDiscord } = require('./org');

// identity split (2026-07-16): dc_members ถูกแยกเป็น users (identity) + org_members (membership+profile per-guild)
// bot write-path ทุกตัวจึงเป็น 2 จังหวะ: upsert users ก่อน (ได้ user_id) → upsert org_members
// key เดิม (guild_id, discord_id) → (user_id, guild_id) ผ่าน partial unique uq_om_user_guild

async function upsertMember(guildId, data) {
  const userId = await upsertUserByDiscord(data.discord_id, {
    username: data.username,
    firstname: data.firstname,
    lastname: data.lastname,
  });
  const orgId = await orgIdOfGuild(guildId);

  const sql = `
  INSERT INTO org_members
    (user_id, org_id, guild_id, display_name, avatar, nickname, member_id, specialty, position, amphoe, province, region, roles, interests, referred_by)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
  ON CONFLICT (user_id, guild_id) WHERE guild_id IS NOT NULL DO UPDATE SET
    org_id = COALESCE(EXCLUDED.org_id, org_members.org_id),
    display_name = EXCLUDED.display_name,
    avatar = EXCLUDED.avatar,
    nickname = EXCLUDED.nickname,
    member_id = EXCLUDED.member_id,
    specialty = EXCLUDED.specialty,
    position = EXCLUDED.position,
    amphoe = EXCLUDED.amphoe,
    province = EXCLUDED.province,
    region = EXCLUDED.region,
    roles = EXCLUDED.roles,
    interests = EXCLUDED.interests,
    referred_by = EXCLUDED.referred_by,
    roles_assigned_at = NOW()
  `;
  const values = [
    userId,
    orgId,
    guildId,
    data.display_name ?? null,
    data.avatar ?? null,
    data.nickname ?? null,
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

async function _deriveRoleFields(member) {
  const guildId = member.guild.id;

  const [provinceRows, interestRows, skillRows] = await Promise.all([
    getRolesByScopePrefix(guildId, 'province:'),
    getPickerRoles(guildId, 'interest'),
    getPickerRoles(guildId, 'skill'),
  ]);

  const allProvinces = provinceRows
    .filter(r => member.roles.cache.has(r.role_id))
    .map(r => r.scope_node.replace('province:', ''))
    .join(',') || null;

  const allRoles = member.roles.cache
    .filter(r => r.name !== '@everyone')
    .map(r => r.name)
    .join(',') || null;

  const interestIds = new Set([...interestRows, ...skillRows].map(r => r.roleId));
  const interestRoles = member.roles.cache
    .filter(r => interestIds.has(r.id))
    .map(r => r.name)
    .join(',') || null;

  return { allProvinces, allRoles, interestRoles };
}

async function upsertMemberFromDiscord(member) {
  await member.fetch();
  const { allProvinces, allRoles, interestRoles } = await _deriveRoleFields(member);

  const userId = await upsertUserByDiscord(member.id, { username: member.user.username });
  const orgId = await orgIdOfGuild(member.guild.id);

  const sql = `
  INSERT INTO org_members
    (user_id, org_id, guild_id, display_name, province, roles, interests)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (user_id, guild_id) WHERE guild_id IS NOT NULL DO UPDATE SET
    org_id = COALESCE(EXCLUDED.org_id, org_members.org_id),
    display_name = EXCLUDED.display_name,
    province = EXCLUDED.province,
    roles = EXCLUDED.roles,
    interests = EXCLUDED.interests,
    roles_assigned_at = NOW()
  `;
  await pool.query(sql, [
    userId,
    orgId,
    member.guild.id,
    member.displayName,
    allProvinces,
    allRoles,
    interestRoles,
  ]);
}

// คืน row รูปร่างเดิม (แบบ dc_members) ให้ caller ไม่ต้องแก้: profile จาก org_members + identity จาก users
async function getMember(guildId, discord_id) {
  const { rows } = await pool.query(
    `SELECT om.*, u.discord_id, u.username, u.firstname, u.lastname, u.phone, u.phone_verified_at
       FROM org_members om
       JOIN users u ON u.id = om.user_id
      WHERE om.guild_id = $1 AND u.discord_id = $2`,
    [guildId, discord_id]
  );
  return rows[0] ?? null;
}

async function syncMemberRoles(member) {
  await member.fetch();
  const guildId = member.guild.id;
  const { allProvinces, allRoles, interestRoles } = await _deriveRoleFields(member);

  await pool.query(
    `UPDATE org_members om
        SET province = $1, roles = $2, interests = $3, roles_assigned_at = NOW()
       FROM users u
      WHERE u.id = om.user_id AND om.guild_id = $4 AND u.discord_id = $5`,
    [allProvinces, allRoles || null, interestRoles, guildId, member.id]
  );
}

module.exports = { upsertMember, upsertMemberFromDiscord, getMember, syncMemberRoles };
