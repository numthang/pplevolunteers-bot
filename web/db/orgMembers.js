// web/db/orgMembers.js — org core: identity (dc_members by email) + org membership (org_members)
// ⚠️ โลก email-org ล้วน — email row = dc_members ที่ discord_id/guild_id/username = NULL (ไม่ปนกับ PPLE)
// identity = dc_members.id · tenant = organizations.id · membership = org_members
import pool from '@/db/index.js'

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// หา/สร้าง identity ด้วย email (global unique ผ่าน uq_dc_members_email partial index)
// email row: guild_id/discord_id/username = NULL (insert explicit NULL, ไม่พึ่ง default '')
export async function findOrCreateUserByEmail(email, displayName = null, client = pool) {
  const e = normalizeEmail(email)
  const { rows } = await client.query(
    `INSERT INTO dc_members (email, display_name, username, guild_id, discord_id)
       VALUES ($1, $2, NULL, NULL, NULL)
     ON CONFLICT (email) WHERE email IS NOT NULL
       DO UPDATE SET display_name = COALESCE(dc_members.display_name, EXCLUDED.display_name),
                     updated_at   = NOW()
     RETURNING id, email, display_name, discord_id`,
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
    `SELECT id, email, display_name, discord_id FROM dc_members WHERE id = $1`,
    [userId]
  )
  return rows[0] || null
}

// org ทั้งหมดของ user (active + invited) — picker ใช้ active, แสดง invited แยกได้
export async function listUserOrgs(userId) {
  const { rows } = await pool.query(
    `SELECT o.id, o.name, o.slug, om.role, om.status
       FROM org_members om
       JOIN organizations o ON o.id = om.org_id
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
    // กัน slug ชน (organizations.slug unique) — เติม suffix สุ่มถ้าซ้ำ
    const exists = await client.query('SELECT 1 FROM organizations WHERE slug = $1', [slug])
    if (exists.rows[0]) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`
    const org = await client.query(
      `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id, name, slug`,
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
