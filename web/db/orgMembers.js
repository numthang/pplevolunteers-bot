// web/db/orgMembers.js — org core: identity (users by email) + org membership (org_members)
//                         + CRUD ของ orgs เอง (createOrg/getOrg/renameOrg/setOrgIcon) อยู่ไฟล์นี้ด้วย
// ⚠️ โลก email-org ล้วน — email row = users ที่ discord_id = NULL (ไม่ปนกับ PPLE)
// identity = users.id · tenant = orgs.id · membership = org_members (email world: guild_id NULL)
import pool from '@/db/index.js'

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// หา/สร้าง identity ด้วย email (global unique ผ่าน uq_users_email partial index)
// users = lean identity · ชื่อเก็บใน users.username (users ไม่มี display_name)
export async function findOrCreateUserByEmail(email, displayName = null, client = pool) {
  const e = normalizeEmail(email)
  const { rows } = await client.query(
    `INSERT INTO users (email, username)
       VALUES ($1, $2)
     ON CONFLICT (email) WHERE email IS NOT NULL
       DO UPDATE SET username   = COALESCE(users.username, EXCLUDED.username),
                     updated_at = NOW()
     RETURNING id, email, username AS display_name, discord_id`,
    [e, displayName]
  )
  return rows[0]
}

// login: claim ทุก invite ที่รอ (shell user ถูกเชิญไว้ → กลายเป็น active)
export async function claimInvites(userId, client = pool) {
  await client.query(
    `UPDATE org_members SET status = 'active' WHERE user_id = $1 AND status = 'invited'`,
    [userId]
  )
}

// เรียกตอน login ทุกประตู (google/magic): resolve identity + claim invite
export async function resolveOrgUser(email, displayName = null) {
  const user = await findOrCreateUserByEmail(email, displayName)
  await claimInvites(user.id)
  return user
}

export async function getUserById(userId) {
  const { rows } = await pool.query(
    `SELECT id, email, username AS display_name, discord_id FROM users WHERE id = $1`,
    [userId]
  )
  return rows[0] || null
}

// org ทั้งหมดของ user (active + invited) — picker ใช้ active, แสดง invited แยกได้
// ⚠️ org_members เป็น per-guild → org หลาย guild (org 1 = 3 guild) ให้ user 1 คนมีหลายแถวต่อ org
//   → GROUP BY o.id dedupe เป็น 1 org/แถว (กัน switcher โชว์ org ซ้ำ)
// member_count = COUNT(DISTINCT user) active (คนจริง ไม่ใช่จำนวนแถว membership)
// status/role = aggregate: active ถ้ามีแถว active สักแถว · owner ถ้าเป็น owner ที่ไหนสักที่
export async function listUserOrgs(userId) {
  const { rows } = await pool.query(
    `SELECT o.id, o.name, o.slug, o.icon,
            CASE WHEN bool_or(om.status = 'active') THEN 'active' ELSE 'invited' END AS status,
            CASE WHEN bool_or(om.role = 'owner')    THEN 'owner'  ELSE 'member'  END AS role,
            (SELECT COUNT(DISTINCT m.user_id) FROM org_members m
              WHERE m.org_id = o.id AND m.status = 'active')::int AS member_count
       FROM org_members om
       JOIN orgs o ON o.id = om.org_id
      WHERE om.user_id = $1
      GROUP BY o.id, o.name, o.slug, o.icon
      ORDER BY min(om.joined_at)`,
    [userId]
  )
  return rows
}

// membership ระดับ org ของ user — aggregate ข้าม guild-rows (per-guild)
// role=owner ถ้าเป็น owner ที่ guild ไหนก็ได้ · status=active ถ้ามีแถว active · HAVING กัน non-member คืน row ผี
export async function getOrgMembership(orgId, userId) {
  const { rows } = await pool.query(
    `SELECT $1::int AS org_id, $2::int AS user_id,
            CASE WHEN bool_or(role = 'owner')   THEN 'owner'  ELSE 'member'  END AS role,
            CASE WHEN bool_or(status = 'active') THEN 'active' ELSE 'invited' END AS status
       FROM org_members
      WHERE org_id = $1 AND user_id = $2
     HAVING count(*) > 0`,
    [orgId, userId]
  )
  return rows[0] || null
}

function slugify(name) {
  const base = String(name || '')
    .trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return base || 'org'
}

// self-serve: creator = owner · org ต้องมี owner ≥ 1 เสมอ (transaction)
export async function createOrg(name, ownerUserId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let slug = slugify(name)
    // กัน slug ชน (orgs.slug unique) — เติม suffix สุ่มถ้าซ้ำ
    const exists = await client.query('SELECT 1 FROM orgs WHERE slug = $1', [slug])
    if (exists.rows[0]) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`
    const org = await client.query(
      `INSERT INTO orgs (name, slug) VALUES ($1, $2) RETURNING id, name, slug`,
      [String(name).trim(), slug]
    )
    await client.query(
      `INSERT INTO org_members (org_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')`,
      [org.rows[0].id, ownerUserId]
    )
    await client.query('COMMIT')
    return org.rows[0]
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function getOrg(orgId) {
  const { rows } = await pool.query(
    `SELECT id, name, slug, icon FROM orgs WHERE id = $1`, [orgId]
  )
  return rows[0] || null
}

// เฉพาะ owner เปลี่ยนชื่อได้ (เช็คสิทธิ์ที่ route)
export async function renameOrg(orgId, name) {
  const { rows } = await pool.query(
    `UPDATE orgs SET name = $2 WHERE id = $1 RETURNING id, name, slug, icon`,
    [orgId, String(name).trim()]
  )
  return rows[0] || null
}

// icon = emoji string หรือ url รูป (/uploads/org/xxx) · null = ลบ (กลับไป guild icon / letter)
export async function setOrgIcon(orgId, icon) {
  const { rows } = await pool.query(
    `UPDATE orgs SET icon = $2 WHERE id = $1 RETURNING id, name, slug, icon`,
    [orgId, icon || null]
  )
  return rows[0] || null
}

// สมาชิกทั้งหมดของ org (join users เอา email/ชื่อ) — owner ก่อน, ตามด้วยเวลาเข้า
// ⚠️ org_members per-guild → org หลาย guild ให้ user คนเดียวมีหลายแถว → DISTINCT ON (user_id)
//   dedupe เป็น 1 คน/แถว (กัน member list ซ้ำ + React dup key)
export async function listOrgMembers(orgId) {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT DISTINCT ON (om.user_id)
              om.user_id, om.role, om.status, om.joined_at,
              u.email, COALESCE(om.display_name, u.username) AS display_name, u.discord_id
         FROM org_members om
         JOIN users u ON u.id = om.user_id
        WHERE om.org_id = $1
        ORDER BY om.user_id, (om.role = 'owner') DESC, om.joined_at
     ) t
     ORDER BY (t.role = 'owner') DESC, t.joined_at`,
    [orgId]
  )
  return rows
}

// governance list เท่านั้น — owner + คำเชิญค้าง + คนมี role พิเศษ (web_roles)
// ไม่ลากอาสาทั้ง org (org ใหญ่ = พันแถว) · คนอื่นหาผ่าน searchOrgMembers
export async function listOrgStaff(orgId) {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT DISTINCT ON (om.user_id)
              om.user_id, om.role, om.status, om.joined_at,
              u.email, COALESCE(om.display_name, u.username) AS display_name, u.discord_id
         FROM org_members om
         JOIN users u ON u.id = om.user_id
        WHERE om.org_id = $1
          AND (om.role <> 'member'
               OR om.status <> 'active'
               OR (om.web_roles IS NOT NULL AND om.web_roles <> ''))
        ORDER BY om.user_id, (om.role = 'owner') DESC, om.joined_at
     ) t
     ORDER BY (t.role = 'owner') DESC, t.joined_at`,
    [orgId]
  )
  return rows
}

// ค้นหาสมาชิกใน org ด้วยชื่อ/อีเมล — LIMIT กันลากทั้งก้อน (ใช้ในหน้า settings หาคนมาแต่งตั้ง/ลบ)
export async function searchOrgMembers(orgId, q, limit = 20) {
  const term = `%${q.trim()}%`
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT DISTINCT ON (om.user_id)
              om.user_id, om.role, om.status, om.joined_at,
              u.email, COALESCE(om.display_name, u.username) AS display_name, u.discord_id
         FROM org_members om
         JOIN users u ON u.id = om.user_id
        WHERE om.org_id = $1
          AND (u.email ILIKE $2 OR om.display_name ILIKE $2 OR u.username ILIKE $2)
        ORDER BY om.user_id, (om.role = 'owner') DESC, om.joined_at
     ) t
     ORDER BY (t.role = 'owner') DESC, t.display_name
     LIMIT $3`,
    [orgId, term, limit]
  )
  return rows
}

// นับ owner ที่ active — COUNT(DISTINCT user) (per-guild rows ไม่ให้ owner คนเดียวถูกนับหลายครั้ง
// ไม่งั้น last-owner guard พังใน org หลาย guild)
async function activeOwnerCount(orgId, client = pool) {
  const { rows } = await client.query(
    `SELECT COUNT(DISTINCT user_id)::int AS n FROM org_members
      WHERE org_id = $1 AND role = 'owner' AND status = 'active'`,
    [orgId]
  )
  return rows[0].n
}

// เปลี่ยน role · กันลด owner คนสุดท้าย (org ต้องมี active owner ≥ 1 เสมอ)
export async function setMemberRole(orgId, userId, role) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const cur = await client.query(
      `SELECT role, status FROM org_members WHERE org_id = $1 AND user_id = $2 FOR UPDATE`,
      [orgId, userId]
    )
    if (!cur.rows[0]) { await client.query('ROLLBACK'); return { error: 'not_found' } }
    // block เฉพาะเมื่อลดขั้น "active owner คนสุดท้าย" (invited owner ไม่นับใน floor)
    const demotingActiveOwner = cur.rows[0].role === 'owner' && cur.rows[0].status === 'active' && role !== 'owner'
    if (demotingActiveOwner && await activeOwnerCount(orgId, client) <= 1) {
      await client.query('ROLLBACK'); return { error: 'last_owner' }
    }
    const { rows } = await client.query(
      `UPDATE org_members SET role = $3 WHERE org_id = $1 AND user_id = $2
       RETURNING user_id, role, status`,
      [orgId, userId, role]
    )
    await client.query('COMMIT')
    return { member: rows[0] }
  } catch (err) {
    await client.query('ROLLBACK'); throw err
  } finally {
    client.release()
  }
}

// ลบสมาชิก (หรือ leave = ลบตัวเอง) · กันลบ owner คนสุดท้าย
export async function removeMember(orgId, userId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const cur = await client.query(
      `SELECT role, status FROM org_members WHERE org_id = $1 AND user_id = $2 FOR UPDATE`,
      [orgId, userId]
    )
    if (!cur.rows[0]) { await client.query('ROLLBACK'); return { error: 'not_found' } }
    // block เฉพาะเมื่อลบ "active owner คนสุดท้าย" (invited owner ไม่นับใน floor)
    if (cur.rows[0].role === 'owner' && cur.rows[0].status === 'active' && await activeOwnerCount(orgId, client) <= 1) {
      await client.query('ROLLBACK'); return { error: 'last_owner' }
    }
    await client.query('DELETE FROM org_members WHERE org_id = $1 AND user_id = $2', [orgId, userId])
    await client.query('COMMIT')
    return { ok: true }
  } catch (err) {
    await client.query('ROLLBACK'); throw err
  } finally {
    client.release()
  }
}

// invite = สร้าง shell user (dc_members email-only) + org_members(status='invited')
// เจ้าตัว login email ตรง → resolveOrgUser เจอ row เดิม + claimInvites flip เป็น active
export async function inviteMember(orgId, email, invitedByUserId, role = 'member') {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const user = await findOrCreateUserByEmail(email, null, client)
    await client.query(
      `INSERT INTO org_members (org_id, user_id, role, status, invited_by)
         VALUES ($1, $2, $3, 'invited', $4)
       ON CONFLICT (user_id, org_id) WHERE guild_id IS NULL DO NOTHING`,
      [orgId, user.id, role, invitedByUserId]
    )
    await client.query('COMMIT')
    return { userId: user.id, email: user.email }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
