/**
 * ตัวกรองการ์ดด้วย **ตัวเลือกใน custom field** — ตรรกะล้วน ไม่แตะ DOM/DB
 * (เทสอยู่ที่ lib/__tests__/kanbanTagFilter.test.js)
 *
 * ⭐ **2026-08-19 ยุบ "ป้าย" เข้า custom field แล้ว** — ไฟล์นี้เคยชื่อ kanbanLabelFilter.js และอ่าน `card.labels`
 *    ตอนนี้อ่านจาก `card.fields` ที่ชนิดเป็น select/multi_select แทน
 *    **กติกาไม่เปลี่ยนเลย** เปลี่ยนแค่ทางเข้าข้อมูล: "กลุ่มป้าย" กลายเป็น "field" ตรงๆ 1:1
 *
 * ⭐ กติกา: **OR ในกลุ่มเดียวกัน · AND ข้ามกลุ่ม**
 *    ของจริงมี 3 field (สายงาน · พื้นที่ · อุปกรณ์) → คนต้องการ "งานสื่อ ที่ราชบุรี" (AND ข้ามกลุ่ม)
 *    และ "ราชบุรี หรือ โพธาราม" (OR ในกลุ่ม) · เป็นกติกาเดียวกับ Jira/Trello
 *
 * ⛔ ห้าม hardcode ชื่อ field — org ตั้งเอง (db/kanban/fields.js)
 * ⛔ checklist ไม่เข้าตัวกรอง — มันคือ "งานย่อยที่ต้องทำ" ไม่ใช่แท็กที่ใช้แบ่งหมวด
 *
 * ⚠️ กรองฝั่ง client จากการ์ดที่โหลดมาแล้วเท่านั้น — listCards ตัดที่ limit
 *    ถ้าวันหนึ่งการ์ดทะลุ limit ต้องย้ายไปกรองใน SQL
 *    ไม่งั้น "ไม่พบ" จะแปลว่า "ไม่พบในที่โหลดมา" ซึ่งโกหกผู้ใช้
 */

/** id เป็น BIGINT → pg คืนมาเป็นสตริง · เทียบกันต้องแปลงให้เป็นสตริงทุกที่ */
const key = (v) => String(v)

/** field ที่นับเป็น "แท็ก" ได้ — checklist ไม่นับ (เป็นงานย่อย ไม่ใช่หมวด) */
const TAG_TYPES = ['select', 'multi_select']

/**
 * แบนค่าจาก custom field ของการ์ด 1 ใบ ให้อยู่ในทรงเดียวกับที่ LabelChips/ตัวกรองเคยรับจากป้าย
 * → `{ id, name, group, color }` โดย `group` = ชื่อ field
 *
 * ⭐ จุดเดียวในระบบที่แปลง field → ชิป — ทั้งชิปบนการ์ดและชิปตัวกรองดึงจากตรงนี้
 *   เขียนซ้ำที่อื่นเมื่อไหร่ = ชิป 2 ที่หลุดจากกันทันที
 */
export function cardTags(card) {
  const out = []
  for (const f of card?.fields || []) {
    if (!TAG_TYPES.includes(f.type)) continue
    for (const o of f.value || []) {
      out.push({ id: o.id, name: o.name, group: f.label, color: o.color })
    }
  }
  return out
}

/** ชื่อกลุ่มของแท็ก (รองรับทั้ง shape ใหม่ `group` และของเดิมที่ส่ง `group_name` มา) */
const groupOf = (label) => label?.group ?? label?.group_name ?? null

/**
 * ป้ายที่ "มีอยู่จริง" บนการ์ดที่โหลดมา + จำนวนการ์ดที่ติดแต่ละป้าย
 *
 * สร้างชิปกรองจากตรงนี้ ไม่ใช่จากคลังตัวเลือกทั้ง org — ตัวเลือกมีเยอะแต่การ์ดที่เห็นใช้จริงไม่กี่อัน
 * ถ้าเอาทั้งคลังมาวาง จะได้ปุ่มกรองที่กดแล้วว่างเปล่าเต็มไปหมด
 *
 * @param {object[]} cards การ์ดที่มี `fields`
 * @returns {{ group: string|null, labels: {id, name, group, color, count}[] }[]}
 */
export function collectFilterGroups(cards = []) {
  const byId = new Map()
  for (const card of cards) {
    for (const l of cardTags(card)) {
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
 * @param {{id, group}[]} selected แท็กที่ถูกเลือก (ต้องมี group ติดมาด้วย ไม่ใช่แค่ id)
 */
export function cardMatchesTags(card, selected = []) {
  if (!selected.length) return true

  const own = new Set(cardTags(card).map((l) => key(l.id)))

  // จัดแท็กที่เลือกเป็นกอง แล้วบังคับว่าทุกกองต้องโดนอย่างน้อย 1 อัน
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
  return cards.filter((c) => cardMatchesTags(c, selected))
}
