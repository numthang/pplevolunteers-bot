const pool = require('./index');

/**
 * org_member_roles — แหล่งความจริงของสิทธิ์ (ORG_ACCESS_REDESIGN ขั้น 5)
 * ฝั่งบอท: หน้าที่เดียวคือซิงค์ยศ Discord เข้ามาเป็น source='discord'
 * (ฝั่งเว็บมีของตัวเองที่ web/db/orgMemberRoles.js — คนละ pool คนละ module system)
 *
 * ⚠️ recompute ทั้ง org ไม่ใช่ทีละ guild — มี role_def ที่หลาย guild แมปร่วมกันจริง
 *    (ทีมบรรณาธิการ/editor แมปทั้ง 2 guild) ถ้าลบตาม guild ที่กำลังซิงค์
 *    สิทธิ์จะหายๆ กลับๆ ตามลำดับการซิงค์ · แบบนี้ idempotent ลำดับไม่มีผล
 *
 * source='web' (ตั้งจากเว็บ) ไม่ถูกแตะ — source อยู่ใน PK จึงอยู่คนละแถวกัน
 */

// ยศที่ user ถืออยู่จริงตอนนี้ แปลงเป็น role_def ผ่าน dc_guild_roles ของ guild ที่เขาอยู่
// (ห้าม join org_role_defs ด้วยชื่อ — ชื่อเดียวกันคนละ guild อาจแมปคนละอย่าง/ไม่แมปเลย
//  เคยพลาดมาแล้ว bug-044: 6 คนได้ admin ทั้ง org)
const WANT_SQL = `
  SELECT DISTINCT om.org_id, om.user_id, r.org_role_def_id AS role_def_id
    FROM org_members om
    JOIN targets t ON t.user_id = om.user_id AND t.org_id = om.org_id
    JOIN LATERAL unnest(string_to_array(COALESCE(om.roles, ''), ',')) AS rn(name) ON TRUE
    JOIN dc_guild_roles r ON r.guild_id = om.guild_id AND r.role_name = trim(rn.name)
   WHERE trim(rn.name) <> ''
     AND r.org_role_def_id IS NOT NULL
`;

const APPLY_SQL = `
, del AS (
  DELETE FROM org_member_roles mr
   USING targets t
   WHERE mr.org_id = t.org_id AND mr.user_id = t.user_id AND mr.source = 'discord'
     AND NOT EXISTS (
       SELECT 1 FROM want w
        WHERE w.org_id = mr.org_id AND w.user_id = mr.user_id AND w.role_def_id = mr.role_def_id
     )
)
INSERT INTO org_member_roles (org_id, user_id, role_def_id, source)
SELECT org_id, user_id, role_def_id, 'discord' FROM want
ON CONFLICT (org_id, user_id, role_def_id, source) DO NOTHING
`;

/** ซิงค์สิทธิ์ของ user คนเดียว (ทุก guild ใน org ที่เขาอยู่) จาก org_members.roles */
async function resyncDiscordRolesForUser(userId) {
  await pool.query(
    `WITH targets AS (
       SELECT DISTINCT user_id, org_id FROM org_members
        WHERE user_id = $1 AND org_id IS NOT NULL
     ), want AS (${WANT_SQL})${APPLY_SQL}`,
    [userId]
  );
}

/** ซิงค์ทั้ง guild — ใช้ตอนการแมปยศเปลี่ยน (ไม่งั้นสิทธิ์ค้างเงียบจนกว่าจะซิงค์รายคน) */
async function resyncDiscordRolesForGuild(guildId) {
  await pool.query(
    `WITH targets AS (
       SELECT DISTINCT user_id, org_id FROM org_members
        WHERE guild_id = $1 AND org_id IS NOT NULL
     ), want AS (${WANT_SQL})${APPLY_SQL}`,
    [guildId]
  );
}

module.exports = { resyncDiscordRolesForUser, resyncDiscordRolesForGuild };
