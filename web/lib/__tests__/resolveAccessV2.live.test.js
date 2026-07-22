/**
 * Live check (ไม่ใช่ unit test — ต่อ DB จริง) — ORG_ACCESS_REDESIGN ขั้น 4
 * รัน: cd web && npx vitest run lib/__tests__/resolveAccessV2.live.js --config vitest.config.js
 *
 * เทียบ resolveAccessV2 (โค้ดจริง) กับกติกาเดิมที่คำนวณด้วย SQL สำหรับ user จริงทุกคน
 * กติกาเดิม: regional → ไล่เฉพาะภาคย่อย · อื่นๆ → เฉพาะ node ที่เป็นใบ (จังหวัด)
 */
import { describe, it, expect } from 'vitest'
import pool from '@/db/index.js'
import { resolveAccessV2, accessFromRoleNames, clearScopeTreeCache } from '../resolveAccessV2.js'

const ORG = 1

describe('resolveAccessV2 กับ DB จริง', () => {
  it('permission ตรงกับ org_member_roles ทุก user (สุ่ม 200 คน)', async () => {
    const { rows: users } = await pool.query(
      `SELECT DISTINCT user_id FROM org_member_roles WHERE org_id = $1 ORDER BY user_id LIMIT 200`, [ORG])

    let checked = 0
    for (const { user_id } of users) {
      const { rows: expected } = await pool.query(
        `SELECT DISTINCT d.permission FROM org_member_roles mr
           JOIN org_role_defs d ON d.id = mr.role_def_id AND d.is_active
          WHERE mr.org_id = $1 AND mr.user_id = $2 AND d.permission IS NOT NULL`,
        [ORG, user_id])
      const access = await resolveAccessV2(ORG, user_id)
      expect(new Set(access.permissions)).toEqual(new Set(expected.map(r => r.permission)))
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  }, 60_000)

  it('scope ตรงกับกติกา "ไล่ชั้นเฉพาะ regional" ทุก user (สุ่ม 200 คน)', async () => {
    const { rows: users } = await pool.query(
      `SELECT DISTINCT user_id FROM org_member_roles WHERE org_id = $1 ORDER BY user_id LIMIT 200`, [ORG])

    for (const { user_id } of users) {
      const { rows: exp } = await pool.query(
        `WITH RECURSIVE held AS (
           SELECT n.id FROM org_member_roles mr
             JOIN org_role_defs d ON d.id = mr.role_def_id AND d.is_active
             JOIN org_scope_nodes n ON n.id = d.scope_node_id
            WHERE mr.org_id = $1 AND mr.user_id = $2),
         is_reg AS (
           SELECT EXISTS (SELECT 1 FROM org_member_roles mr
             JOIN org_role_defs d ON d.id = mr.role_def_id
            WHERE mr.org_id = $1 AND mr.user_id = $2
              AND d.permission = 'regional_coordinator') AS v),
         exp AS (
           SELECT id FROM held
           UNION
           SELECT c.id FROM org_scope_nodes c JOIN exp e ON c.parent_id = e.id
            WHERE (SELECT v FROM is_reg))
         SELECT n.key FROM exp JOIN org_scope_nodes n ON n.id = exp.id`,
        [ORG, user_id])

      const access = await resolveAccessV2(ORG, user_id)
      expect(new Set(access.scopeGrants)).toEqual(new Set(exp.map(r => r.key)))
    }
  }, 60_000)

  it('view-as-role: combo "ผู้ประสานงานภาค + ทีมภาคกลางตะวันตก" ไล่ชั้นถึงจังหวัด', async () => {
    clearScopeTreeCache()
    const a = await accessFromRoleNames(ORG, ['ผู้ประสานงานภาค', 'ทีมภาคกลางตะวันตก'])
    expect(a.permissions.has('regional_coordinator')).toBe(true)
    expect(a.scopeGrants).toContain('ราชบุรี')
    expect(a.scopeGrants).toContain('นครปฐม')
  })

  it('view-as-role: combo "ผู้ประสานงานจังหวัด + ทีมราชบุรี" ไม่หลุดไปจังหวัดอื่น', async () => {
    const a = await accessFromRoleNames(ORG, ['ผู้ประสานงานจังหวัด', 'ทีมราชบุรี'])
    expect(a.scopeGrants).toContain('ราชบุรี')
    expect(a.scopeGrants).not.toContain('นครปฐม')
  })

  it('คนนอก org → ไม่มีสิทธิ์อะไรเลย (fail-safe)', async () => {
    const a = await resolveAccessV2(ORG, 999999999)
    expect(a.isMember).toBe(false)
    expect(a.permissions.size).toBe(0)
    expect(a.scopeGrants).toEqual([])
  })
})
