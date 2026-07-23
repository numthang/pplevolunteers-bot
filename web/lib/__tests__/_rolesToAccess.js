/**
 * Test fixture — แปลงชื่อ role (guild อาสาประชาชน) → access object
 *
 * นี่คือ policy mirror เดิมของ seed-guild-roles.js ที่ย้ายมาเป็น "test-only" หลังลบออกจาก production
 * (runtime ใช้ DB จริงผ่าน resolveAccess แล้ว) — test ใช้ตัวนี้แปลง array ชื่อ role ในเคสเดิม
 * ให้เป็น access object เพื่อพิสูจน์ว่า branching ของ financeAccess/callingAccess ยังถูก
 *
 * ⚠️ อัปเดต 2026-07-22 (ORG_ACCESS_REDESIGN ขั้น 4): `scopeGrants` เปลี่ยนสัญญา
 *   เดิม = grant ดิบมี prefix ('province:ราชบุรี') แล้วให้แต่ละแอพ expand เอง คนละกติกา
 *   ใหม่ = **ชื่อพื้นที่ล้วน ที่ไล่ชั้นเสร็จแล้ว** — resolveAccessV2 จัดการให้ที่เดียว
 *
 *   การไล่ชั้นถูกกั้นด้วย "ตำแหน่ง" ไม่ใช่รูปร่างต้นไม้ (กฎดั้งเดิม user ยืนยัน 2026-07-22):
 *   ยศ "ทีม<ภาค>" ติดอัตโนมัติให้ทุกคนที่กดเลือกจังหวัด → ถือไว้เฉยๆ ไม่ได้แปลว่าดูแลทั้งภาค
 *   → ไล่ชั้นเฉพาะ regional_coordinator (ผู้ประสานงานภาค / รองเลขาธิการ)
 *
 *   fixture นี้จำลองกติกาเดียวกับ reduceRoleDefs() เพื่อให้เคส behavior เดิมทั้ง 85 ตัว
 *   ยังเป็นตัวพิสูจน์ว่าย้ายแล้วพฤติกรรมไม่เพี้ยน
 */
import { SUB_REGION_MAP, MAIN_REGION_MAP } from '../geography.js'

const PERMISSION_BY_ROLE = {
  'Admin':                'admin',
  'เลขาธิการ':            'secretary_general',
  'ผู้ประสานงานภาค':      'regional_coordinator',
  'รองเลขาธิการ':         'regional_coordinator',
  'ผู้ประสานงานจังหวัด':  'province_coordinator',
  'กรรมการจังหวัด':       'district_coordinator',
  'เหรัญญิก':             'treasurer',
  'ทีมบรรณาธิการ':        'editor',
  'Moderator':            'moderator',
}

const PROVINCES        = new Set(Object.keys(SUB_REGION_MAP))
const SUBREGION_ROLES  = new Set(Object.values(SUB_REGION_MAP))
const MAINREGION_ROLES = new Set(Object.values(MAIN_REGION_MAP))

/** ทุกอย่างที่อยู่ใต้ node นี้ (รวมตัวมันเอง) — เลียนแบบ expandScope() บนต้นไม้ของ geography */
function descendantsOf(key) {
  const out = new Set([key])
  if (PROVINCES.has(key)) return out                       // จังหวัด = ใบ ไม่มีลูก

  if (SUBREGION_ROLES.has(key)) {
    for (const [prov, sub] of Object.entries(SUB_REGION_MAP)) if (sub === key) out.add(prov)
  }
  if (MAINREGION_ROLES.has(key)) {
    for (const [prov, main] of Object.entries(MAIN_REGION_MAP)) {
      if (main !== key) continue
      out.add(prov)
      out.add(SUB_REGION_MAP[prov])                        // ภาคย่อยที่คั่นกลาง
    }
  }
  return out
}

/** roleNames[] → { permissions: Set, scopeGrants: [] } — scopeGrants = ชื่อพื้นที่ล้วน ไล่ชั้นแล้ว */
export function rolesToAccess(roleNames = []) {
  const permissions = new Set()
  const held = []
  for (const r of roleNames) {
    if (PERMISSION_BY_ROLE[r]) permissions.add(PERMISSION_BY_ROLE[r])
    if (!r.startsWith('ทีม')) continue
    const prov = r.replace(/^ทีม/, '')
    if (PROVINCES.has(prov))     { held.push(prov); continue }
    if (SUBREGION_ROLES.has(r) || MAINREGION_ROLES.has(r)) held.push(r)
  }

  // ไล่ชั้นเฉพาะตำแหน่งระดับภาค · คนอื่นได้เฉพาะ node ที่ถือตรงๆ
  const canExpand = permissions.has('regional_coordinator')
  const keys = new Set()
  for (const k of held) {
    if (canExpand) for (const d of descendantsOf(k)) keys.add(d)
    else keys.add(k)
  }

  return { permissions, scopeGrants: Array.from(keys) }
}
