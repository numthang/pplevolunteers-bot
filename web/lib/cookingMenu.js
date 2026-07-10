// Pure sanitizer สำหรับ payload เมนูที่ผู้ใช้ส่งมา (add/edit/import). ไม่มี IO.
// คืน { menu } (shape ตรงกับ cooking_menus / matcher) หรือ { error } ถ้าไม่ผ่าน.
// ⚠️ gates คือหัวใจของ matcher — imported menu ที่ gates ว่างจะ "ทำได้เสมอ" (protein gate ว่าง = ผ่าน)
//    UI ควรบังคับให้กรอก gates.protein อย่างน้อย 1 เว้นแต่เป็นเมนูมังสวิรัติจริงๆ

const strArr = (v) =>
  Array.isArray(v)
    ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
    : []

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export function normalizeMenuInput(body) {
  const name = str(body?.name)
  if (!name) return { error: 'ต้องมีชื่อเมนู' }

  const g = body?.gates || {}
  const menu = {
    name,
    food_groups: strArr(body?.food_groups),
    protein: strArr(body?.protein),
    method: str(body?.method),
    cuisine: str(body?.cuisine),
    flavor: strArr(body?.flavor),
    carb_in_dish: !!body?.carb_in_dish,
    ingredients: {
      core: strArr(body?.ingredients?.core),
      optional: strArr(body?.ingredients?.optional),
    },
    staples_used: strArr(body?.staples_used),
    steps: strArr(body?.steps),
    gates: { protein: strArr(g?.protein), key: strArr(g?.key) },
    image: { emoji: str(body?.image?.emoji), url: str(body?.image?.url) },
  }
  return { menu }
}
