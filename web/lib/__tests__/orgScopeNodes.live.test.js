/**
 * Live check (ต่อ DB จริง) — ตัวจัดผังพื้นที่ (org_scope_nodes)
 * รัน: cd web && npm run test:live
 *
 * เน้นพิสูจน์ 2 ข้อที่ /scrutinize ชี้ว่าเป็น blocker ถ้าปล่อยตาม DDL:
 *   1. ลบ node ที่มีลูก/มียศผูก ต้องถูกบล็อก (DDL เป็น CASCADE + SET NULL → กดครั้งเดียวสิทธิ์หายยกภาค)
 *   2. ย้าย parent ไปใต้ลูกตัวเอง ต้องถูกปฏิเสธ (DDL กันแค่ชี้ตัวเอง วง A→B→A ยังสร้างได้)
 *
 * ⚠️ เทสนี้เขียน DB จริง — สร้าง node prefix 'zz-test-' แล้วลบทิ้งใน finally
 */
import { describe, it, expect, afterAll } from 'vitest'
import pool from '@/db/index.js'
import {
  listScopeNodes, createScopeNode, updateScopeNode, deleteScopeNode,
} from '@/db/orgScopeNodes.js'

const ORG = 1
const PREFIX = 'zz-test-scope-'

afterAll(async () => {
  // ลูกก่อนแม่ — FK parent_id
  await pool.query(
    `DELETE FROM org_scope_nodes WHERE org_id = $1 AND key LIKE $2`,
    [ORG, `${PREFIX}%`]
  )
})

async function mk(key, parentId = null) {
  const r = await createScopeNode(ORG, { key: PREFIX + key, label: `ทดสอบ ${key}`, parentId })
  expect(r.error).toBeUndefined()
  return r.node
}

describe('org_scope_nodes — ตัวจัดผัง', () => {
  it('สร้าง node ซ้อนชั้นได้ และ listScopeNodes นับลูกถูก', async () => {
    const parent = await mk('ภาค')
    const child = await mk('จังหวัด', parent.id)

    const nodes = await listScopeNodes(ORG)
    const p = nodes.find(n => n.id === parent.id)
    const c = nodes.find(n => n.id === child.id)
    expect(p.child_count).toBe(1)
    expect(c.parent_id).toBe(parent.id)
  })

  it('key ซ้ำ → ปฏิเสธ ไม่ทับของเดิม', async () => {
    const a = await mk('ซ้ำ')
    const again = await createScopeNode(ORG, { key: a.key, label: 'ชื่ออื่น' })
    expect(again.error).toMatch(/มีพื้นที่รหัส/)

    const nodes = await listScopeNodes(ORG)
    expect(nodes.find(n => n.id === a.id).label).toBe(a.label)   // ของเดิมไม่ถูกทับ
  })

  it('ย้ายไปอยู่ใต้ลูกของตัวเอง → ปฏิเสธ (กันวนลูป)', async () => {
    const a = await mk('วน-a')
    const b = await mk('วน-b', a.id)
    const c = await mk('วน-c', b.id)

    // a ย้ายไปใต้ c (หลานตัวเอง) = วง
    const r = await updateScopeNode(ORG, a.id, { parentId: c.id })
    expect(r.error).toMatch(/วนลูป/)

    const nodes = await listScopeNodes(ORG)
    expect(nodes.find(n => n.id === a.id).parent_id).toBeNull()   // ไม่ขยับ
  })

  it('ตั้งตัวเองเป็น parent → ปฏิเสธ', async () => {
    const a = await mk('ตัวเอง')
    const r = await updateScopeNode(ORG, a.id, { parentId: a.id })
    expect(r.error).toBeTruthy()
  })

  it('ลบ node ที่มีลูก → บล็อก (ไม่ปล่อยให้ CASCADE ลบทั้งกิ่ง)', async () => {
    const parent = await mk('ลบ-แม่')
    const child = await mk('ลบ-ลูก', parent.id)

    const r = await deleteScopeNode(ORG, parent.id)
    expect(r.error).toMatch(/พื้นที่ย่อย/)

    const nodes = await listScopeNodes(ORG)
    expect(nodes.find(n => n.id === child.id)).toBeTruthy()   // ลูกยังอยู่ครบ
  })

  it('ลบ node ที่มียศผูก → บล็อก (ไม่ปล่อยให้ SET NULL ทำใบยศหลุดพื้นที่)', async () => {
    const node = await mk('ลบ-มียศ')
    const { rows } = await pool.query(
      `INSERT INTO org_role_defs (org_id, name, permission, scope_node_id)
       VALUES ($1, $2, NULL, $3) RETURNING id`,
      [ORG, `${PREFIX}ใบยศทดสอบ`, node.id]
    )
    try {
      const r = await deleteScopeNode(ORG, node.id)
      expect(r.error).toMatch(/ยศผูกอยู่/)

      const still = await pool.query(
        `SELECT scope_node_id FROM org_role_defs WHERE id = $1`, [rows[0].id]
      )
      expect(still.rows[0].scope_node_id).toBe(node.id)   // ใบยศไม่หลุดพื้นที่
    } finally {
      await pool.query(`DELETE FROM org_role_defs WHERE id = $1`, [rows[0].id])
    }
  })

  it('ลบ node ที่ไม่มีลูกไม่มียศ → ลบได้', async () => {
    const node = await mk('ลบ-ว่าง')
    const r = await deleteScopeNode(ORG, node.id)
    expect(r.error).toBeUndefined()

    const nodes = await listScopeNodes(ORG)
    expect(nodes.find(n => n.id === node.id)).toBeUndefined()
  })
})
