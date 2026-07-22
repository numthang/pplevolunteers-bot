import pool from '@/db/index.js'

/**
 * org_member_roles — แหล่งความจริงของสิทธิ์ (ORG_ACCESS_REDESIGN ขั้น 5)
 * ฝั่งเว็บ: ทั้งทางเขียนจากเว็บ (source='web') และการซิงค์ยศ Discord (source='discord')
 * ฝั่งบอทมีของตัวเองที่ db/orgMemberRoles.js — คนละ pool คนละ module system
 *
 * ⚠️ recompute ทั้ง org ไม่ใช่ทีละ guild — มี role_def ที่หลาย guild แมปร่วมกันจริง
 *    (ทีมบรรณาธิการ/editor แมปทั้ง 2 guild) ถ้าลบตาม guild ที่กำลังซิงค์
 *    สิทธิ์จะหายๆ กลับๆ ตามลำดับการซิงค์ · แบบนี้ idempotent ลำดับไม่มีผล
 *
 * source='web' กับ source='discord' อยู่คนละแถว (source อยู่ใน PK) → ซิงค์ Discord
 * ไม่ลบสิทธิ์ที่ตั้งจากเว็บ และกลับกัน
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
`

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
`

/** ซิงค์สิทธิ์ของ user คนเดียว (ทุก guild ใน org ที่เขาอยู่) จาก org_members.roles */
export async function resyncDiscordRolesForUser(userId) {
  await pool.query(
    `WITH targets AS (
       SELECT DISTINCT user_id, org_id FROM org_members
        WHERE user_id = $1 AND org_id IS NOT NULL
     ), want AS (${WANT_SQL})${APPLY_SQL}`,
    [userId]
  )
}

/** ซิงค์ทั้ง guild — ใช้ตอนการแมปยศเปลี่ยน (ไม่งั้นสิทธิ์ค้างเงียบจนกว่าจะซิงค์รายคน) */
export async function resyncDiscordRolesForGuild(guildId) {
  await pool.query(
    `WITH targets AS (
       SELECT DISTINCT user_id, org_id FROM org_members
        WHERE guild_id = $1 AND org_id IS NOT NULL
     ), want AS (${WANT_SQL})${APPLY_SQL}`,
    [guildId]
  )
}

/**
 * หา role_def "ตำแหน่งล้วน" (ไม่ผูกพื้นที่) ของ permission นี้ — ไม่มีก็สร้าง
 * ใช้ตอนแต่งตั้งผ่านเว็บ ซึ่งให้ได้แค่ตำแหน่ง ไม่ได้ให้พื้นที่
 *
 * ⚠️ permission เดียวอาจมีได้หลายใบ (เช่น regional_coordinator = ทั้ง 'ผู้ประสานงานภาค'
 *    และ 'รองเลขาธิการ') → เลือกด้วย id น้อยสุดเสมอ ให้ผลคงที่ ไม่ปล่อยให้ DB เลือกเอง
 */
export async function findOrCreatePermissionDef(orgId, permissionKey) {
  const { rows } = await pool.query(
    `SELECT id FROM org_role_defs
      WHERE org_id = $1 AND permission = $2 AND scope_node_id IS NULL AND is_active
      ORDER BY id LIMIT 1`,
    [orgId, permissionKey]
  )
  if (rows[0]) return rows[0].id

  const { rows: lr } = await pool.query(`SELECT label_th FROM org_roles WHERE key = $1`, [permissionKey])
  const label = lr[0]?.label_th || permissionKey

  // ชื่ออาจชนกับยศที่มีอยู่แล้ว (unique org_id+name) → ลองชื่อสำรองต่อท้ายด้วย key
  for (const name of [label, `${label} (${permissionKey})`]) {
    const { rows: ins } = await pool.query(
      `INSERT INTO org_role_defs (org_id, name, permission, scope_node_id)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (org_id, name) DO NOTHING
       RETURNING id`,
      [orgId, name, permissionKey]
    )
    if (ins[0]) return ins[0].id
  }
  throw new Error(`สร้างตำแหน่งสำหรับสิทธิ์ ${permissionKey} ไม่ได้ (ชื่อชนทั้งหมด)`)
}

/** ให้/ถอดสิทธิ์ที่ตั้งจากเว็บ (source='web') — ไม่แตะสิทธิ์ที่มาจาก Discord */
export async function grantWebRole(orgId, userId, permissionKey, grantedBy) {
  const roleDefId = await findOrCreatePermissionDef(orgId, permissionKey)
  await pool.query(
    `INSERT INTO org_member_roles (org_id, user_id, role_def_id, source, granted_by)
     VALUES ($1, $2, $3, 'web', $4)
     ON CONFLICT (org_id, user_id, role_def_id, source) DO NOTHING`,
    [orgId, userId, roleDefId, grantedBy || null]
  )
}

export async function revokeWebRole(orgId, userId, permissionKey) {
  await pool.query(
    `DELETE FROM org_member_roles mr
      USING org_role_defs d
      WHERE d.id = mr.role_def_id
        AND mr.org_id = $1 AND mr.user_id = $2 AND mr.source = 'web'
        AND d.permission = $3`,
    [orgId, userId, permissionKey]
  )
}

/** permission ที่ user ถืออยู่จริงตอนนี้ (ทั้งจากเว็บและจาก Discord) พร้อมที่มา */
export async function getMemberPermissions(orgId, userId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT d.permission, mr.source
       FROM org_member_roles mr
       JOIN org_role_defs d ON d.id = mr.role_def_id AND d.is_active
      WHERE mr.org_id = $1 AND mr.user_id = $2 AND d.permission IS NOT NULL`,
    [orgId, userId]
  )
  return rows
}

/**
 * guild ที่ user อยู่ และมียศ Discord แมปกับ permission นี้ไว้
 * ใช้สั่ง Discord ให้ตรงกับสิทธิ์ที่ตั้งในเว็บ — และ "ถอดให้จริง" ตอน revoke
 * (ถ้าไม่ถอดยศ Discord ด้วย ซิงค์รอบหน้าจะคืนสิทธิ์กลับมาเงียบๆ)
 */
export async function listDiscordRoleTargets(orgId, userId, permissionKey) {
  const { rows } = await pool.query(
    `SELECT om.guild_id, r.role_id, r.role_name, om.roles
       FROM org_members om
       JOIN dc_guild_roles r ON r.guild_id = om.guild_id AND r.permission = $3
      WHERE om.org_id = $1 AND om.user_id = $2 AND om.guild_id IS NOT NULL`,
    [orgId, userId, permissionKey]
  )
  return rows
}

/**
 * การแมปยศ Discord เปลี่ยน (permission/scope_node/parent) → อัปเดต org_role_defs ตาม
 * แล้วคืน orgId ให้ caller ไปซิงค์สมาชิกต่อ
 *
 * ⚠️ จำเป็นเพราะแบบใหม่แปลความหมายยศ **ตอนเขียน** ไม่ใช่ตอนอ่าน — แก้การแมปแล้ว
 *    ถ้าไม่ซิงค์ใหม่ ของที่ซิงค์ไว้เดิมจะไม่เปลี่ยน = สิทธิ์ค้างแบบเงียบ
 *    (ข้อแลกเปลี่ยนที่เคาะไว้ใน md/ORG_ACCESS_REDESIGN.md ข้อ 4)
 *
 * ⚠️ org_role_defs ยุบด้วย "ชื่อยศ" ระดับ org — ถ้ายศชื่อเดียวกันถูกแมปในหลาย guild
 *    การแก้จาก guild เดียวจะเปลี่ยนความหมายให้ทุก guild (วันนี้มีกรณีเดียว: ทีมบรรณาธิการ)
 */
export async function syncRoleDefFromGuildRole(guildId, roleId) {
  const { rows } = await pool.query(
    `SELECT g.org_id, r.role_name, r.permission, r.scope_node, r.parent_role_id
       FROM dc_guild_roles r JOIN dc_guilds g ON g.guild_id = r.guild_id
      WHERE r.guild_id = $1 AND r.role_id = $2`,
    [guildId, roleId]
  )
  const r = rows[0]
  if (!r?.org_id) return null

  // ยศที่ไม่ให้ทั้งสิทธิ์และพื้นที่ = ยศสังคม → ตัดสายไม่ให้มีผลต่อสิทธิ์ (ไม่ลบ def ทิ้ง
  // เพราะ guild อื่นอาจยังใช้ใบเดียวกันอยู่ · แถวสมาชิกจะหลุดเองตอน resync)
  if (!r.permission && !r.scope_node) {
    await pool.query(
      `UPDATE dc_guild_roles SET org_role_def_id = NULL WHERE guild_id = $1 AND role_id = $2`,
      [guildId, roleId]
    )
    return r.org_id
  }

  let scopeNodeId = null
  if (r.scope_node) {
    const key = r.scope_node.split(':').slice(1).join(':')
    const { rows: nr } = await pool.query(
      `INSERT INTO org_scope_nodes (org_id, key, label)
       VALUES ($1, $2, $2)
       ON CONFLICT (org_id, key) DO UPDATE SET key = EXCLUDED.key
       RETURNING id`,
      [r.org_id, key]
    )
    scopeNodeId = nr[0].id

    // พ่อของ node = scope_node ของยศแม่ (parent_role_id) — ถ้าแม่ไม่ใช่ยศพื้นที่ก็ไม่ผูก
    if (r.parent_role_id) {
      await pool.query(
        `UPDATE org_scope_nodes child
            SET parent_id = parent.id
           FROM dc_guild_roles pr
           JOIN org_scope_nodes parent ON parent.org_id = $1
                                      AND parent.key = split_part(pr.scope_node, ':', 2)
          WHERE pr.guild_id = $2 AND pr.role_id = $3 AND pr.scope_node IS NOT NULL
            AND child.id = $4 AND child.id <> parent.id
            AND child.parent_id IS DISTINCT FROM parent.id`,
        [r.org_id, guildId, r.parent_role_id, scopeNodeId]
      )
    }
  }

  const { rows: dr } = await pool.query(
    `INSERT INTO org_role_defs (org_id, name, permission, scope_node_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, name) DO UPDATE
        SET permission = EXCLUDED.permission, scope_node_id = EXCLUDED.scope_node_id
     RETURNING id`,
    [r.org_id, r.role_name, r.permission, scopeNodeId]
  )
  await pool.query(
    `UPDATE dc_guild_roles SET org_role_def_id = $1 WHERE guild_id = $2 AND role_id = $3`,
    [dr[0].id, guildId, roleId]
  )
  return r.org_id
}

/** เขียนสำเนาชื่อยศลง org_members.roles ให้ตรงกับ Discord (สำเนา/log — ไม่ใช่แหล่งความจริง) */
export async function setRolesCopy(userId, guildId, roleName, mode) {
  const { rows } = await pool.query(
    `SELECT roles FROM org_members WHERE user_id = $1 AND guild_id = $2`,
    [userId, guildId]
  )
  const set = new Set((rows[0]?.roles || '').split(',').map(s => s.trim()).filter(Boolean))
  if (mode === 'add') set.add(roleName)
  else set.delete(roleName)
  await pool.query(
    `UPDATE org_members SET roles = $1, roles_assigned_at = NOW() WHERE user_id = $2 AND guild_id = $3`,
    [Array.from(set).join(',') || null, userId, guildId]
  )
}
