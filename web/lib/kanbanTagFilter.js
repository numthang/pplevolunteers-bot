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
 * ⚠️ กรองฝั่ง client จากการ์ดที่โหลดมาแล้วเท่านั้น — **ตั้งใจ** (เคาะ 2026-08-24 หลัง /scrutinize)
 *    listCards เลิกมี LIMIT ที่ชนได้แล้ว เหลือแต่เพดานกันระเบิด `CARD_HARD_CAP` ที่ไม่มีวันชนจริง
 *    (ของจริงเต็มที่ราว 1,500 ใบ · เพดาน 3000) → ชุดที่โหลดมา = ทั้ง org จริงๆ ตัวกรองจึงไม่โกหก
 *
 * ⛔ ห้ามเอา LIMIT ที่ชนได้กลับมาโดยไม่ย้ายตัวกรองไป SQL **พร้อมกับตัวเรียง** (lib/kanbanSort.js)
 *    LIMIT ถูกตัดด้วย ORDER BY due_at ตายตัว ไม่เกี่ยวกับที่ผู้ใช้เลือกเรียง
 *    → มี LIMIT เมื่อไหร่ "ไม่พบ" กับ "เรียงแล้ว" กลายเป็นคำโกหกพร้อมกันทั้งคู่
 *    ชนเพดานจริงเมื่อไหร่ API ส่ง `truncated: true` มาให้ UI บอกผู้ใช้ตรงๆ
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
      // field_id ติดมาด้วยตั้งแต่ 2026-08-30 — ใช้เป็น "กุญแจกลุ่ม" ตอนเทียบ (ดู matchGroupOf)
      // ชื่อ field (`group`) ยังอยู่เพราะ UI ใช้ตั้งหัวกลุ่มชิป และเปลี่ยนชื่อได้
      out.push({ id: o.id, name: o.name, group: f.label, field_id: f.field_id, color: o.color })
    }
  }
  return out
}

/** ชื่อกลุ่มของแท็ก (รองรับทั้ง shape ใหม่ `group` และของเดิมที่ส่ง `group_name` มา) — ใช้ **แสดงผล** */
const groupOf = (label) => label?.group ?? label?.group_name ?? null

/**
 * กุญแจที่ใช้ **จัดกอง OR/AND ตอนเทียบ** — ต่างจาก groupOf ที่ใช้แสดงผล
 *
 * ⭐ ทำไมต้องแยก (2026-08-30 ตอนทำ URL filter ที่แชร์ลิงก์ได้):
 *    ชิปที่ถูกเลือกอาจมาจาก URL ของคนอื่น ซึ่งอ้าง option ที่ **การ์ดในมือเราไม่มีสักใบ**
 *    → ไม่มีทางรู้ชื่อ field จากการ์ด แต่ URL พก `field_id` มาให้ได้
 *    ถ้าใช้ชื่อเป็นกุญแจ ตัวที่ไม่รู้จักจะตกไปกอง null รวมกันหมด แล้วกติกา
 *    "OR ในกลุ่มเดียวกัน" พังทันที (เช่น ราชบุรี OR โพธาราม ที่ปลายทางมีแค่ราชบุรี
 *     จะกลายเป็นกองที่ไม่มีวันตรง = กระดานว่างทั้งที่คนส่งเห็นการ์ด)
 *
 * ⚠️ fallback เป็นชื่อ ไม่ใช่ตัดทิ้ง — ของเก่า/เทสที่ประกอบแท็กเองไม่มี field_id
 */
const matchGroupOf = (label) =>
  label?.field_id != null ? `f${key(label.field_id)}` : groupOf(label)

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
    const g = matchGroupOf(l) || ''
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
