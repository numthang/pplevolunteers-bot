// Cooking (/cooking) — pure meal-matching logic. No IO; caller passes data.
// menus: from menus.seed.json (.menus) · each has { food_groups[], protein[], method,
//   cuisine, carb_in_dish, gates:{ protein[], key[] }, ... }
// `have` = Set of tokens the user ticked: protein enum tokens (pork/chicken/...) AND
//   canonical key tokens (Thai: กะทิ/ผงกะหรี่/...). The two namespaces never collide.

// ── makeability ────────────────────────────────────────────────
// protein gate = OR (any one of the listed proteins is enough)
// key gate     = AND (every defining ingredient must be on hand)
export function isMakeable(menu, have) {
  const g = menu.gates || { protein: [], key: [] }
  const proteinOK = !g.protein?.length || g.protein.some((p) => have.has(p))
  const keyOK = (g.key || []).every((k) => have.has(k))
  return proteinOK && keyOK
}

export function makeableMenus(menus, have) {
  return menus.filter((m) => isMakeable(m, have))
}

// ── meal roles ────────────────────────────────────────────────
const isDessertOrDrink = (m) =>
  m.food_groups?.includes('dessert') && !m.food_groups?.includes('protein')

// a "main" carries the meal: has protein, or is a one-plate carb+veg dish (ข้าวยำ/ผัดหมี่ผัก).
// plain carbs / breads / desserts / drinks are NOT mains.
export function isMain(m) {
  if (isDessertOrDrink(m)) return false
  return (
    m.food_groups?.includes('protein') ||
    (m.carb_in_dish && m.food_groups?.includes('veg'))
  )
}
const providesVeg = (m) => m.food_groups?.includes('veg')
// a light dish usable to complete a plate with a vegetable
const isVegSide = (m) =>
  providesVeg(m) && ['salad-yum', 'boil-soup', 'curry'].includes(m.method)

// ── variety scoring ───────────────────────────────────────────
// recent = [{ protein:[], method, cuisine }] for meals cooked in the window (newest first).
// Penalise a candidate that repeats an axis of a recent meal; nearer meals weigh more.
export function varietyScore(menu, recent) {
  let score = 1
  recent.forEach((r, i) => {
    const w = 1 - i * 0.15 // decay: most recent hits hardest
    if (w <= 0) return
    if ((menu.protein || []).some((p) => (r.protein || []).includes(p))) score -= 0.3 * w
    if (menu.method === r.method) score -= 0.2 * w
    if (menu.cuisine === r.cuisine) score -= 0.15 * w
  })
  return score
}

// pick weighted-randomly among the top slice so rerolls feel fresh but stay varied
function pickTopish(ranked, excludeId) {
  const pool = ranked.filter((m) => m.id !== excludeId)
  if (!pool.length) return null
  const top = pool.slice(0, Math.max(3, Math.ceil(pool.length * 0.4)))
  return top[Math.floor(Math.random() * top.length)]
}

// ── main entry ────────────────────────────────────────────────
// returns { main, side, needsVeg, reason } or { empty:true }
export function suggestMeal(menus, have, recent = [], { excludeId = null } = {}) {
  const pool = makeableMenus(menus, have)
  const mains = pool
    .filter(isMain)
    .map((m) => ({ m, s: varietyScore(m, recent) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m)

  if (!mains.length) return { empty: true, makeableCount: pool.length }

  const main = pickTopish(mains, excludeId)
  const needsVeg = !providesVeg(main)

  let side = null
  if (needsVeg) {
    const sides = pool
      .filter((m) => m.id !== main.id && isVegSide(m))
      // prefer a side that doesn't repeat the main's protein
      .sort((a, b) => {
        const clash = (m) => (m.protein || []).some((p) => (main.protein || []).includes(p))
        return clash(a) - clash(b)
      })
    side = sides[0] || null
  }

  return {
    main,
    side,
    needsVeg,
    // carb = ข้าว (staple) ถ้าจานหลักไม่ใช่ข้าว/เส้นในตัว
    carb: main.carb_in_dish ? null : 'ข้าว',
    reason: needsVeg
      ? side
        ? 'จานหลักโปรตีน + เติมผักให้ครบมื้อ'
        : 'จานหลักโปรตีน (ยังขาดผัก — ไม่มีผักที่ทำได้ตอนนี้)'
      : 'จานเดียวครบโปรตีน+ผัก',
  }
}

// market list helper: canonical tokens the user marked 'out'
export function marketList(pantryRows) {
  return pantryRows.filter((r) => r.status === 'out').map((r) => r.ingredient)
}
