import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock pg pool (default export) ก่อน import resolveAccess
vi.mock('@/db/index.js', () => ({ default: { query: vi.fn() } }))
import pool from '@/db/index.js'
import { resolveAccess, reduceRoleRows, clearAccessCache } from '../resolveAccess.js'

// catalog ตัวอย่าง (เลียนแบบ seed อาสาประชาชน)
const CATALOG = [
  { role_name: 'Admin',           permission: 'admin',                scope_node: null },
  { role_name: 'เลขาธิการ',        permission: 'secretary_general',    scope_node: null },
  { role_name: 'ผู้ประสานงานภาค',  permission: 'regional_coordinator', scope_node: null },
  { role_name: 'เหรัญญิก',         permission: 'treasurer',            scope_node: null },
  { role_name: 'Moderator',       permission: 'moderator',            scope_node: null },
  { role_name: 'ทีมราชบุรี',       permission: null,                   scope_node: 'province:ราชบุรี' },
  { role_name: 'ทีมภาคกลางตะวันตก', permission: null,                  scope_node: 'subregion:ทีมภาคกลางตะวันตก' },
  { role_name: 'ทีมภาคกลาง',       permission: null,                   scope_node: 'region:ทีมภาคกลาง' },
  { role_name: 'อาสาส้ม',          permission: null,                   scope_node: null }, // picker-only
]

// helper: สร้าง byName map แบบเดียวกับ loadGuildRoles
function byNameFrom(rows) {
  const m = new Map()
  for (const r of rows) {
    if (!m.has(r.role_name)) m.set(r.role_name, [])
    m.get(r.role_name).push(r)
  }
  return m
}

// ---- reduceRoleRows (pure) ----
describe('reduceRoleRows', () => {
  const byName = byNameFrom(CATALOG)

  it('permission ถูกรวมจากหลาย role', () => {
    const { permissions } = reduceRoleRows(byName, ['Admin', 'เหรัญญิก'])
    expect(permissions).toEqual(new Set(['admin', 'treasurer']))
  })

  it('scope grant ดิบ (ยังไม่ expand)', () => {
    const { scopeGrants } = reduceRoleRows(byName, ['ทีมราชบุรี', 'ทีมภาคกลาง'])
    expect(scopeGrants).toEqual(['province:ราชบุรี', 'region:ทีมภาคกลาง'])
  })

  it('role ที่ scope+permission null → ไม่ contribute', () => {
    const { permissions, scopeGrants } = reduceRoleRows(byName, ['อาสาส้ม'])
    expect(permissions.size).toBe(0)
    expect(scopeGrants).toEqual([])
  })

  it('role ที่ไม่มีใน catalog → มองข้าม (fail-safe)', () => {
    const { permissions, scopeGrants } = reduceRoleRows(byName, ['ไม่มีจริง'])
    expect(permissions.size).toBe(0)
    expect(scopeGrants).toEqual([])
  })

  it(' province role พ่วงทั้ง scope (permission ยัง null)', () => {
    const { permissions, scopeGrants } = reduceRoleRows(byName, ['ทีมราชบุรี'])
    expect(permissions.size).toBe(0)
    expect(scopeGrants).toEqual(['province:ราชบุรี'])
  })

  it('role ซ้ำชื่อ (array) → รวมทุกแถว', () => {
    const dup = byNameFrom([
      { role_name: 'เหรัญญิก', permission: 'treasurer', scope_node: null },
      { role_name: 'เหรัญญิก', permission: null,        scope_node: 'province:ราชบุรี' },
    ])
    const { permissions, scopeGrants } = reduceRoleRows(dup, ['เหรัญญิก'])
    expect(permissions).toEqual(new Set(['treasurer']))
    expect(scopeGrants).toEqual(['province:ราชบุรี'])
  })
})

// ---- resolveAccess (mocked DB) ----
describe('resolveAccess', () => {
  beforeEach(() => {
    clearAccessCache()
    pool.query.mockReset()
    pool.query.mockResolvedValue({ rows: CATALOG })
  })

  it('สมาชิกมี role → permissions + scopeGrants', async () => {
    const res = await resolveAccess('g1', ['Admin', 'ทีมราชบุรี'])
    expect(res.isMember).toBe(true)
    expect(res.permissions).toEqual(new Set(['admin']))
    expect(res.scopeGrants).toEqual(['province:ราชบุรี'])
  })

  it('สมาชิกไม่มี role พิเศษ ([]) → isMember=true แต่ว่าง', async () => {
    const res = await resolveAccess('g1', [])
    expect(res.isMember).toBe(true)
    expect(res.permissions.size).toBe(0)
    expect(res.scopeGrants).toEqual([])
  })

  it('ไม่ใช่สมาชิก (null) → isMember=false, ไม่ query DB', async () => {
    const res = await resolveAccess('g1', null)
    expect(res.isMember).toBe(false)
    expect(res.permissions.size).toBe(0)
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('cache: เรียกซ้ำ guild เดิม → query DB ครั้งเดียว', async () => {
    await resolveAccess('g1', ['Admin'])
    await resolveAccess('g1', ['เหรัญญิก'])
    expect(pool.query).toHaveBeenCalledTimes(1)
  })

  it('clearAccessCache → query DB ใหม่', async () => {
    await resolveAccess('g1', ['Admin'])
    clearAccessCache('g1')
    await resolveAccess('g1', ['Admin'])
    expect(pool.query).toHaveBeenCalledTimes(2)
  })
})
