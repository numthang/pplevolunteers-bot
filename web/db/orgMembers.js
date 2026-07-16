// web/db/orgMembers.js — org core: identity (dc_members by email) + org membership (org_members)
// ⚠️ โลก email-org ล้วน — email row = dc_members ที่ discord_id/guild_id/username = NULL (ไม่ปนกับ PPLE)
// identity = dc_members.id · tenant = orgs.id · membership = org_members
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
export async function listUserOrgs(userId) {
  const { rows } = await pool.query(
    `SELECT o.id, o.name, o.slug, om.role, om.status
       FROM org_members om
       JOIN orgs o ON o.id = om.org_id
      WHERE om.user_id = $1
      ORDER BY om.joined_at`,
    [userId]
  )
  return rows
}

export async function getOrgMembership(orgId, userId) {
  const { rows } = await pool.query(
    `SELECT org_id, user_id, role, status FROM org_members WHERE org_id = $1 AND user_id = $2`,
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
    `SELECT id, name, slug FROM orgs WHERE id = $1`, [orgId]
  )
  return rows[0] || null
}

// เฉพาะ owner เปลี่ยนชื่อได้ (เช็คสิทธิ์ที่ route)
export async function renameOrg(orgId, name) {
  const { rows } = await pool.query(
    `UPDATE orgs SET name = $2 WHERE id = $1 RETURNING id, name, slug`,
    [orgId, String(name).trim()]
  )
  return rows[0] || null
}

// สมาชิกทั้งหมดของ org (join users เอา email/ชื่อ) — owner ก่อน, ตามด้วยเวลาเข้า
export async function listOrgMembers(orgId) {
  const { rows } = await pool.query(
    `SELECT om.user_id, om.role, om.status, om.joined_at,
            u.email, COALESCE(om.display_name, u.username) AS display_name, u.discord_id
       FROM org_members om
       JOIN users u ON u.id = om.user_id
      WHERE om.org_id = $1
      ORDER BY (om.role = 'owner') DESC, om.joined_at`,
    [orgId]
  )
  return rows
}

async function activeOwnerCount(orgId, client = pool) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM org_members
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
       ON CONFLICT (org_id, user_id) DO NOTHING`,
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
