/**
 * Live check (ต่อ DB จริง) — ORG_ACCESS_REDESIGN ขั้น 5: "ทางเขียน"
 * รัน: cd web && npm run test:live
 *
 * ขั้น 4 สลับทางอ่านไป org_member_roles แล้ว แต่ทางเขียนยังเขียนที่เดิม = สิทธิ์แช่แข็ง
 * เทสนี้พิสูจน์ว่าแก้ยศแล้ว "สิทธิ์ขยับจริง" ไม่ใช่แค่ตารางสำเนาขยับ
 *
 * ⚠️ เทสนี้เขียน DB จริง — snapshot ของเดิมไว้แล้วคืนค่าใน finally ทุกเคส
 */
import { describe, it, expect } from 'vitest'
import pool from '@/db/index.js'
import {
  resyncDiscordRolesForUser, grantWebRole, revokeWebRole, getMemberPermissions,
  syncRoleDefFromGuildRole,
} from '@/db/orgMemberRoles.js'
import { resolveAccessV2 } from '../resolveAccessV2.js'

const ORG = 1

/** หา user จริงที่ถือยศ Discord ซึ่งแมป permission ไว้ — คืนยศ+guild ที่ใช้ทดสอบได้ */
async function pickSubject() {
  const { rows } = await pool.query(
    `SELECT om.user_id, om.guild_id, om.roles, r.role_name, r.permission
       FROM org_members om
       JOIN LATERAL unnest(string_to_array(om.roles, ',')) AS rn(name) ON TRUE
       JOIN dc_guild_roles r ON r.guild_id = om.guild_id AND r.role_name = trim(rn.name)
      WHERE om.org_id = $1 AND r.permission IS NOT NULL AND r.org_role_def_id IS NOT NULL
      ORDER BY om.user_id LIMIT 1`,
    [ORG]
  )
  return rows[0]
}

async function snapshot(userId) {
  const [{ rows: roleRows }, { rows: memberRows }] = await Promise.all([
    pool.query(`SELECT * FROM org_member_roles WHERE org_id = $1 AND user_id = $2`, [ORG, userId]),
    pool.query(`SELECT guild_id, roles FROM org_members WHERE org_id = $1 AND user_id = $2`, [ORG, userId]),
  ])
  return { roleRows, memberRows }
}

async function restore(userId, snap) {
  await pool.query(`DELETE FROM org_member_roles WHERE org_id = $1 AND user_id = $2`, [ORG, userId])
  for (const r of snap.roleRows) {
    await pool.query(
      `INSERT INTO org_member_roles (org_id, user_id, role_def_id, source, granted_by, granted_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [r.org_id, r.user_id, r.role_def_id, r.source, r.granted_by, r.granted_at]
    )
  }
  for (const m of snap.memberRows) {
    await pool.query(
      `UPDATE org_members SET roles = $1 WHERE org_id = $2 AND user_id = $3 AND guild_id IS NOT DISTINCT FROM $4`,
      [m.roles, ORG, userId, m.guild_id]
    )
  }
}

describe('ทางเขียน org_member_roles (DB จริง)', () => {
  it('resync ซ้ำแล้วไม่เปลี่ยนอะไร (idempotent)', async () => {
    const s = await pickSubject()
    expect(s).toBeTruthy()
    const before = await snapshot(s.user_id)
    await resyncDiscordRolesForUser(s.user_id)
    const after = await snapshot(s.user_id)
    expect(after.roleRows.map(r => `${r.role_def_id}:${r.source}`).sort())
      .toEqual(before.roleRows.map(r => `${r.role_def_id}:${r.source}`).sort())
  })

  it('ถอดยศ Discord ออกจาก roles → สิทธิ์หายจริง · ใส่กลับ → กลับมา', async () => {
    const s = await pickSubject()
    const snap = await snapshot(s.user_id)
    try {
      const kept = s.roles.split(',').map(x => x.trim()).filter(x => x && x !== s.role_name)
      await pool.query(
        `UPDATE org_members SET roles = $1 WHERE org_id = $2 AND user_id = $3 AND guild_id = $4`,
        [kept.join(',') || null, ORG, s.user_id, s.guild_id]
      )
      await resyncDiscordRolesForUser(s.user_id)
      const gone = await resolveAccessV2(ORG, s.user_id)
      expect(gone.permissions.has(s.permission)).toBe(false)

      await pool.query(
        `UPDATE org_members SET roles = $1 WHERE org_id = $2 AND user_id = $3 AND guild_id = $4`,
        [s.roles, ORG, s.user_id, s.guild_id]
      )
      await resyncDiscordRolesForUser(s.user_id)
      const back = await resolveAccessV2(ORG, s.user_id)
      expect(back.permissions.has(s.permission)).toBe(true)
    } finally {
      await restore(s.user_id, snap)
    }
  })

  // ยศที่แมปไว้แล้วทั้งหมดต้อง "ซิงค์ซ้ำแล้วนิ่ง" — ถ้าไม่นิ่ง แปลว่าตัวแปลง
  // dc_guild_roles → org_role_defs ตีความไม่ตรงกับ migration ที่ย้ายข้อมูลมาตอนแรก
  it('syncRoleDefFromGuildRole ซ้ำแล้วไม่ขยับอะไร (ตรงกับ migration ขั้น 2)', async () => {
    const { rows: roles } = await pool.query(
      `SELECT r.guild_id, r.role_id FROM dc_guild_roles r
        JOIN dc_guilds g ON g.guild_id = r.guild_id AND g.org_id = $1
       WHERE r.org_role_def_id IS NOT NULL
       ORDER BY r.role_id LIMIT 40`,
      [ORG]
    )
    expect(roles.length).toBeGreaterThan(0)

    const before = await pool.query(
      `SELECT id, name, permission, scope_node_id FROM org_role_defs WHERE org_id = $1 ORDER BY id`, [ORG])
    const beforeNodes = await pool.query(
      `SELECT id, key, parent_id FROM org_scope_nodes WHERE org_id = $1 ORDER BY id`, [ORG])
    const beforeLinks = await pool.query(
      `SELECT guild_id, role_id, org_role_def_id FROM dc_guild_roles ORDER BY guild_id, role_id`)

    for (const r of roles) await syncRoleDefFromGuildRole(r.guild_id, r.role_id)

    const after = await pool.query(
      `SELECT id, name, permission, scope_node_id FROM org_role_defs WHERE org_id = $1 ORDER BY id`, [ORG])
    const afterNodes = await pool.query(
      `SELECT id, key, parent_id FROM org_scope_nodes WHERE org_id = $1 ORDER BY id`, [ORG])
    const afterLinks = await pool.query(
      `SELECT guild_id, role_id, org_role_def_id FROM dc_guild_roles ORDER BY guild_id, role_id`)

    expect(after.rows).toEqual(before.rows)
    expect(afterNodes.rows).toEqual(beforeNodes.rows)
    expect(afterLinks.rows).toEqual(beforeLinks.rows)
  })

  it('สิทธิ์ที่ตั้งจากเว็บไม่ถูกซิงค์ Discord ลบทิ้ง (source แยกแถวกัน)', async () => {
    const s = await pickSubject()
    const snap = await snapshot(s.user_id)
    try {
      await grantWebRole(ORG, s.user_id, 'treasurer', null)
      await resyncDiscordRolesForUser(s.user_id)   // ซิงค์ Discord ต้องไม่แตะแถว web
      let held = await getMemberPermissions(ORG, s.user_id)
      expect(held.some(h => h.permission === 'treasurer' && h.source === 'web')).toBe(true)

      await revokeWebRole(ORG, s.user_id, 'treasurer')
      held = await getMemberPermissions(ORG, s.user_id)
      expect(held.some(h => h.permission === 'treasurer' && h.source === 'web')).toBe(false)
      // ยศที่มาจาก Discord ยังอยู่ครบ
      expect(held.some(h => h.permission === s.permission && h.source === 'discord')).toBe(true)
    } finally {
      await restore(s.user_id, snap)
    }
  })
})
