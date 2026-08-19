/**
 * kanbanOptionActions — จัดการ "ตัวเลือกในคลัง" (kanban_field_options) จากฝั่ง client
 *
 * ⭐ ทำไมต้องแยกออกมา: user เคาะ 2026-08-19 ค่ำว่า **เช็คลิสต์ต้องพฤติกรรมเดียวกับ select เป๊ะ**
 *    (แก้ชื่อ = rename ทั้งคลัง · ซ่อน/เอากลับ · ลบถาวรพร้อมนับจำนวนการ์ด)
 *    ถ้าปล่อยให้ TagCombobox กับ ChecklistFieldBox ต่างคนต่างยิง fetch เอง = วันหนึ่งจะไม่เหมือนกันแน่นอน
 *    → **ทุกจุดที่แตะ option ต้องเรียกผ่านไฟล์นี้** ห้ามยิง /api/kanban/fields/../options เองในคอมโพเนนต์
 *
 * ⚠️ ฟังก์ชันที่นี่ไม่แตะ state ของใคร — คืนผลอย่างเดียว แต่ละคอมโพเนนต์อัปเดต state ตัวเองต่อ
 */

const base = (fieldId) => `/api/kanban/fields/${fieldId}/options`

/** ตัวเลือกทั้งชุด · archived=true = เอาตัวที่ซ่อนไว้มาด้วย (ต้องมี ไม่งั้นกด "เอากลับ" ไม่ได้) */
export async function fetchOptions(fieldId, { archived = false } = {}) {
  const res = await fetch(`${base(fieldId)}${archived ? '?archived=1' : ''}`)
  if (!res.ok) return null
  const json = await res.json().catch(() => ({}))
  return json.options || []
}

/** แก้ชื่อ/สี · 409 = ชื่อซ้ำ (ตัวเรียกต้องเด้งค่าเดิมกลับ ไม่งั้นช่องโชว์ชื่อที่ DB ไม่เคยรับ) */
export async function patchOption(fieldId, optId, patch) {
  const res = await fetch(`${base(fieldId)}/${optId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok && Boolean(json.option), status: res.status, option: json.option, error: json.error }
}

/** ซ่อน / เอากลับ — ไม่ต้องถามยืนยัน เพราะกดคืนได้ทันทีในกล่องเดียวกัน */
export const setOptionArchived = (fieldId, optId, archived) => patchOption(fieldId, optId, { archived })

/** นับว่าใช้อยู่กี่การ์ด — นับไม่ได้คืน null (ยังต้องถามต่อ ห้ามเงียบแล้วลบเลย แค่ไม่มีตัวเลขให้ดู) */
export async function fetchOptionImpact(fieldId, optId) {
  try {
    const res = await fetch(`${base(fieldId)}/${optId}?impact=1`)
    if (!res.ok) return null
    const json = await res.json()
    return Number(json.impact?.picked || 0) + Number(json.impact?.checklist || 0)
  } catch {
    return null
  }
}

/**
 * ลบตัวเลือกถาวร — **ไม่ถามเอง** ตัวเรียกต้องผ่าน DeleteChoiceDialog มาก่อนแล้ว
 *
 * ⛔ เดิมเป็น `deleteOptionWithConfirm()` ที่เรียก `window.confirm` เอง — ถอดทิ้ง 2026-08-19 ค่ำ
 *    user สั่งให้ใช้กล่องเดียวกับ "ลบการบ้าน" (DeleteChoiceDialog) ทุกที่ เพราะกล่องนั้นแยก
 *    **ซ่อน / ลบถาวร / ยกเลิก** ให้เห็นพร้อมกัน ส่วน confirm บังคับให้เลือกได้แค่ ตกลง/ยกเลิก
 *
 * ⚠️ endpoint นี้ไม่มี gate ยศโดยตั้งใจ — ตัวเลขจำนวนการ์ดในกล่องคือกลไกกันพลาด
 *    (คุมด้วยยศแล้ว flow "พิมพ์ชื่อใหม่ = สร้างตัวเลือก" พังทันที)
 */
export async function deleteOption(fieldId, optId) {
  try {
    const res = await fetch(`${base(fieldId)}/${optId}`, { method: 'DELETE' })
    if (res.ok) return { ok: true }
    const json = await res.json().catch(() => ({}))
    return { ok: false, error: json.error }
  } catch {
    return { ok: false }
  }
}
