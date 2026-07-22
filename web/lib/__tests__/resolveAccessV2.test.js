import { describe, it, expect, vi } from 'vitest'

vi.mock('@/db/index.js', () => ({ default: { query: vi.fn() } }))
import { expandScope, reduceRoleDefs } from '../resolveAccessV2.js'

// ต้นไม้ตัวอย่าง (เลียนโครง PPLE จริง 3 ชั้น: ภาคใหญ่ → ภาคย่อย → จังหวัด)
//   1 ภาคกลาง
//     2 ภาคกลางตะวันตก
//       4 ราชบุรี   5 นครปฐม
//     3 ปริมณฑล        ← ไม่มีลูก (ในของจริงบาง subregion ก็ไม่มีพ่อ/ลูกครบ)
//   6 ภาคเหนือ (ไม่มีลูก)
function makeTree(pairs) {
  const byId = new Map()
  const childrenOf = new Map()
  for (const [id, key, parentId] of pairs) {
    byId.set(id, { key, parentId })
    if (parentId != null) {
      if (!childrenOf.has(parentId)) childrenOf.set(parentId, [])
      childrenOf.get(parentId).push(id)
    }
  }
  return { byId, childrenOf }
}

const TREE = makeTree([
  [1, 'ทีมภาคกลาง', null],
  [2, 'ทีมภาคกลางตะวันตก', 1],
  [3, 'ทีมปริมณฑล', 1],
  [4, 'ราชบุรี', 2],
  [5, 'นครปฐม', 2],
  [6, 'ทีมภาคเหนือ', null],
])

describe('expandScope — ถือ node ไหน ได้ทุกอย่างใต้มัน', () => {
  it('ถือจังหวัด → ได้จังหวัดเดียว', () => {
    expect(expandScope([4], TREE)).toEqual(new Set(['ราชบุรี']))
  })

  it('ถือภาคย่อย → ได้ตัวเอง + จังหวัดใต้มันทั้งหมด', () => {
    expect(expandScope([2], TREE)).toEqual(new Set(['ทีมภาคกลางตะวันตก', 'ราชบุรี', 'นครปฐม']))
  })

  it('ถือภาคใหญ่ → ได้ทั้งสายลงไปถึงจังหวัด (นี่คือที่ calling เดิมทำไม่ได้)', () => {
    expect(expandScope([1], TREE)).toEqual(
      new Set(['ทีมภาคกลาง', 'ทีมภาคกลางตะวันตก', 'ทีมปริมณฑล', 'ราชบุรี', 'นครปฐม'])
    )
  })

  it('ถือหลาย node → รวมกัน ไม่ซ้ำ', () => {
    expect(expandScope([4, 6], TREE)).toEqual(new Set(['ราชบุรี', 'ทีมภาคเหนือ']))
  })

  it('ไม่ถืออะไร → ว่าง', () => {
    expect(expandScope([], TREE)).toEqual(new Set())
  })

  it('node id ที่ไม่มีในต้นไม้ → ข้ามเงียบๆ ไม่ throw', () => {
    expect(expandScope([999], TREE)).toEqual(new Set())
  })

  it('ต้นไม้วนลูป → ไม่ค้าง (กันด้วย seen)', () => {
    const cyclic = makeTree([[1, 'a', 2], [2, 'b', 1]])
    expect(expandScope([1], cyclic)).toEqual(new Set(['a', 'b']))
  })
})

describe('reduceRoleDefs — รวมตำแหน่งที่ถือ', () => {
  it('ใบตำแหน่ง + ใบพื้นที่ (โมเดล PPLE ที่แยก 2 ใบ)', () => {
    const defs = [
      { permission: 'province_coordinator', scope_node_id: null },
      { permission: null, scope_node_id: 4 },
    ]
    const out = reduceRoleDefs(defs, TREE)
    expect(out.permissions).toEqual(new Set(['province_coordinator']))
    expect(out.scopeGrants).toEqual(['ราชบุรี'])
  })

  it('ใบเดียวที่มีทั้งตำแหน่งและพื้นที่ (โมเดลที่ org ใหม่จะใช้)', () => {
    const out = reduceRoleDefs([{ permission: 'treasurer', scope_node_id: 2 }], TREE)
    expect(out.permissions).toEqual(new Set(['treasurer']))
    expect(new Set(out.scopeGrants)).toEqual(new Set(['ทีมภาคกลางตะวันตก', 'ราชบุรี', 'นครปฐม']))
  })

  it('หลายตำแหน่ง → permission รวมกัน พื้นที่รวมกัน', () => {
    const defs = [
      { permission: 'treasurer', scope_node_id: 4 },
      { permission: 'caseworker', scope_node_id: 6 },
    ]
    const out = reduceRoleDefs(defs, TREE)
    expect(out.permissions).toEqual(new Set(['treasurer', 'caseworker']))
    expect(new Set(out.scopeGrants)).toEqual(new Set(['ราชบุรี', 'ทีมภาคเหนือ']))
  })

  it('ไม่มีตำแหน่งเลย → ว่างทั้งคู่ (fail-safe ไม่ใช่ให้สิทธิ์)', () => {
    const out = reduceRoleDefs([], TREE)
    expect(out.permissions).toEqual(new Set())
    expect(out.scopeGrants).toEqual([])
  })

  it('ตำแหน่งที่ไม่ผูกพื้นที่ → ได้ permission แต่พื้นที่ว่าง', () => {
    const out = reduceRoleDefs([{ permission: 'admin', scope_node_id: null }], TREE)
    expect(out.permissions).toEqual(new Set(['admin']))
    expect(out.scopeGrants).toEqual([])
  })
})
