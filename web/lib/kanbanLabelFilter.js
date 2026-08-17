/**
 * ตัวกรองการ์ดด้วยป้าย — ตรรกะล้วน ไม่แตะ DOM/DB (เทสอยู่ที่ lib/__tests__/kanbanLabelFilter.test.js)
 *
 * ⭐ กติกาที่เลือก: **OR ในกลุ่มเดียวกัน · AND ข้ามกลุ่ม**
 *    ของจริงมี 3 กลุ่ม (สายงาน · พื้นที่ · อุปกรณ์) → คนต้องการ "งานสื่อ ที่ราชบุรี" (AND ข้ามกลุ่ม)
 *    และ "ราชบุรี หรือ โพธาราม" (OR ในกลุ่ม) · เป็นกติกาเดียวกับ Jira/Trello
 *
 * ⛔ ห้าม hardcode ชื่อกลุ่ม — กลุ่มเป็นข้อมูลที่ org ตั้งเอง (db/kanban/labels.js)
 *
 * ⚠️ กรองฝั่ง client จากการ์ดที่โหลดมาแล้วเท่านั้น — listCards ตัดที่ limit 200
 *    ของจริงตอนนี้ 34 ใบจึงยังตรง · ถ้าวันหนึ่งการ์ดทะลุ limit ต้องย้ายไปกรองใน SQL
 *    ไม่งั้น "ไม่พบ" จะแปลว่า "ไม่พบในที่โหลดมา" ซึ่งโกหกผู้ใช้
 */

/** id ของป้ายเป็น BIGINT → pg คืนมาเป็นสตริง · เทียบกันต้องแปลงให้เป็นสตริงทุกที่ */
const key = (v) => String(v)

/** ชื่อกลุ่มของป้าย (รองรับทั้ง shape ของ cards.js `group` และของ labels.js `group_name`) */
const groupOf = (label) => label?.group ?? label?.group_name ?? null

/**
 * ป้ายที่ "มีอยู่จริง" บนการ์ดที่โหลดมา + จำนวนการ์ดที่ติดแต่ละป้าย
 *
 * สร้างชิปกรองจากตรงนี้ ไม่ใช่จากคลังป้ายทั้ง org — ป้าย 29 อันแต่การ์ดที่เห็นใช้จริงไม่กี่อัน
 * ถ้าเอาทั้งคลังมาวาง จะได้ปุ่มกรองที่กดแล้วว่างเปล่าเต็มไปหมด
 *
 * @param {object[]} cards การ์ดที่มี field `labels`
 * @returns {{ group: string|null, labels: {id, name, group, color, count}[] }[]}
 */
export function collectFilterGroups(cards = []) {
  const byId = new Map()
  for (const card of cards) {
    for (const l of card?.labels || []) {
      const k = key(l.id)
      if (!byId.has(k)) byId.set(k, { ...l, id: k, group: groupOf(l), count: 0 })
      byId.get(k).count++
    }
  }

  const byGroup = new Map()
  for (const l of byId.values()) {
    const g = l.group || ''
    if (!byGroup.has(g)) byGroup.set(g, [])
    byGroup.get(g).push(l)
  }

  return [...byGroup.entries()]
    .map(([group, labels]) => ({
      group: group || null,
      labels: labels.sort((a, b) => a.name.localeCompare(b.name, 'th')),
    }))
    // กองไม่มีกลุ่มไปท้ายสุดเสมอ ที่เหลือเรียงตามชื่อกลุ่ม
    .sort((a, b) => (a.group === null) - (b.group === null) || String(a.group).localeCompare(String(b.group), 'th'))
}

/**
 * การ์ดใบนี้ผ่านตัวกรองไหม
 * @param {object} card
 * @param {{id, group}[]} selected ป้ายที่ถูกเลือก (ต้องมี group ติดมาด้วย ไม่ใช่แค่ id)
 */
export function cardMatchesLabels(card, selected = []) {
  if (!selected.length) return true

  const own = new Set((card?.labels || []).map((l) => key(l.id)))

  // จัดป้ายที่เลือกเป็นกอง แล้วบังคับว่าทุกกองต้องโดนอย่างน้อย 1 อัน
  const wanted = new Map()
  for (const l of selected) {
    const g = groupOf(l) || ''
    if (!wanted.has(g)) wanted.set(g, [])
    wanted.get(g).push(key(l.id))
  }

  for (const ids of wanted.values()) {
    if (!ids.some((id) => own.has(id))) return false
  }
  return true
}

/** กรองรายการการ์ด — เก็บลำดับเดิมไว้ (หน้าแรกเรียงตามกำหนดส่งมาแล้ว) */
export function filterCards(cards = [], selected = []) {
  if (!selected.length) return cards
  return cards.filter((c) => cardMatchesLabels(c, selected))
}
