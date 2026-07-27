import crypto from 'crypto'
import pool from '@/db/index.js'

// Invite link เข้า org แบบ Notion — ลิงก์เดียวแชร์ได้ ใครเปิด+login ก็เข้าร่วม
// ต่างจาก email invite (org_members status=invited ต่อคน): ลิงก์ไม่รู้ user_id ล่วงหน้า + มี token/uses/expiry

const newToken = () => crypto.randomBytes(24).toString('base64url')

// active link ล่าสุดของ org (สำหรับโชว์ในหน้า settings) · null = ยังไม่มี/ถูกปิด/หมดอายุ
export async function getActiveInviteLink(orgId) {
  const { rows } = await pool.query(
    `SELECT token, role, expires_at, max_uses, uses, created_at
       FROM org_invite_links
      WHERE org_id = $1 AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
      LIMIT 1`,
    [orgId]
  )
  return rows[0] || null
}

// สร้าง/รีเซ็ตลิงก์: ปิดของเดิมทั้งหมด → ออกอันใหม่ (reset semantics เหมือน Notion)
export async function createInviteLink(orgId, createdBy, { role = 'member', expiresAt = null, maxUses = null } = {}) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE org_invite_links SET revoked_at = NOW() WHERE org_id = $1 AND revoked_at IS NULL`,
      [orgId]
    )
    const token = newToken()
    const { rows } = await client.query(
      `INSERT INTO org_invite_links (org_id, created_by, token, role, expires_at, max_uses)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING token, role, expires_at, max_uses, uses, created_at`,
      [orgId, createdBy, token, role, expiresAt, maxUses]
    )
    await client.query('COMMIT')
    return rows[0]
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

// ปิดลิงก์ active ทั้งหมดของ org
export async function revokeInviteLink(orgId) {
  await pool.query(
    `UPDATE org_invite_links SET revoked_at = NOW() WHERE org_id = $1 AND revoked_at IS NULL`,
    [orgId]
  )
}

// อ่านลิงก์ตาม token + ข้อมูล org (หน้า /join แสดงชื่อ/ไอคอน org) · ไม่กรอง validity (คืน flag ให้ caller ตัดสิน)
export async function getInviteLinkByToken(token) {
  const { rows } = await pool.query(
    `SELECT l.token, l.org_id, l.role, l.expires_at, l.max_uses, l.uses, l.revoked_at,
            o.name AS org_name, o.icon AS org_icon
       FROM org_invite_links l
       JOIN orgs o ON o.id = l.org_id
      WHERE l.token = $1`,
    [token]
  )
  const l = rows[0]
  if (!l) return null
  const invalid =
    l.revoked_at ? 'revoked'
    : (l.expires_at && new Date(l.expires_at) <= new Date()) ? 'expired'
    : (l.max_uses != null && l.uses >= l.max_uses) ? 'full'
    : null
  return { ...l, invalid }
}

// redeem: เพิ่ม user เป็นสมาชิก active — transaction + FOR UPDATE กัน race เกิน max_uses
// คืน { orgId, orgName, role, alreadyMember } · โยน error code ถ้าลิงก์ใช้ไม่ได้
export async function redeemInviteLink(token, userId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT l.org_id, l.role, l.expires_at, l.max_uses, l.uses, l.revoked_at, o.name AS org_name
         FROM org_invite_links l JOIN orgs o ON o.id = l.org_id
        WHERE l.token = $1 FOR UPDATE OF l`,
      [token]
    )
    const l = rows[0]
    if (!l) throw Object.assign(new Error('not_found'), { code: 'not_found' })
    if (l.revoked_at) throw Object.assign(new Error('revoked'), { code: 'revoked' })
    if (l.expires_at && new Date(l.expires_at) <= new Date()) throw Object.assign(new Error('expired'), { code: 'expired' })
    if (l.max_uses != null && l.uses >= l.max_uses) throw Object.assign(new Error('full'), { code: 'full' })

    const ins = await client.query(
      `INSERT INTO org_members (org_id, user_id, role, status, invited_by)
         VALUES ($1, $2, $3, 'active', $4)
       ON CONFLICT (user_id, org_id) WHERE guild_id IS NULL DO NOTHING
       RETURNING id`,
      [l.org_id, userId, l.role, null]
    )
    const alreadyMember = ins.rowCount === 0
    if (!alreadyMember) {
      await client.query(`UPDATE org_invite_links SET uses = uses + 1 WHERE token = $1`, [token])
    }
    await client.query('COMMIT')
    return { orgId: l.org_id, orgName: l.org_name, role: l.role, alreadyMember }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}
