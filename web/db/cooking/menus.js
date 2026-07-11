import pool from '../index.js'

// cooking_menus: public wiki เดียว — ไม่มีเจ้าของ ใครก็แก้/ลบได้หมด (เคาะ 2026-07-11)
// owner column เหลือไว้เป็น "ใครสร้าง" เฉยๆ ไม่ได้ใช้ gate สิทธิ์อะไรแล้ว
// JSONB columns มาจาก pg เป็น JS object แล้ว (ไม่ต้อง parse).

// map DB row → menu shape ที่ cookingMatch.js / CookingClient คาดหวัง (image เป็น nested)
function toMenu(r) {
  return {
    id: r.id,
    owner: r.owner,
    name: r.name,
    food_groups: r.food_groups || [],
    protein: r.protein || [],
    method: r.method,
    cuisine: r.cuisine,
    flavor: r.flavor || [],
    carb_in_dish: r.carb_in_dish,
    ingredients: r.ingredients || { core: [], optional: [] },
    staples_used: r.staples_used || [],
    steps: r.steps || [],
    gates: r.gates || { protein: [], key: [] },
    image: { emoji: r.image_emoji, url: r.image_url },
    source: r.source,
  }
}

// เมนูทั้งหมด (public) — เลี้ยง matcher. seed มาก่อน, ของผู้ใช้ตามหลัง
export async function getAllMenus() {
  const { rows } = await pool.query(
    `SELECT * FROM cooking_menus ORDER BY owner IS NOT NULL, created_at`
  )
  return rows.map(toMenu)
}

const J = (v) => JSON.stringify(v ?? null)

// สร้างเมนูของผู้ใช้ (id ต้อง unique — caller gen มาแล้ว) · source = 'U'
export async function createMenu(owner, m) {
  const { rows } = await pool.query(
    `INSERT INTO cooking_menus
       (id, owner, name, food_groups, protein, method, cuisine, flavor,
        carb_in_dish, ingredients, staples_used, steps, gates,
        image_emoji, image_url, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'U')
     RETURNING *`,
    [
      m.id, owner, m.name, J(m.food_groups), J(m.protein), m.method || null,
      m.cuisine || null, J(m.flavor), !!m.carb_in_dish, J(m.ingredients),
      J(m.staples_used), J(m.steps), J(m.gates),
      m.image?.emoji || null, m.image?.url || null,
    ]
  )
  return toMenu(rows[0])
}

// แก้เมนู — ใครก็แก้ได้ (public wiki)
export async function updateMenu(id, m) {
  const { rows } = await pool.query(
    `UPDATE cooking_menus SET
       name = $2, food_groups = $3, protein = $4, method = $5, cuisine = $6,
       flavor = $7, carb_in_dish = $8, ingredients = $9, staples_used = $10,
       steps = $11, gates = $12, image_emoji = $13, image_url = $14
     WHERE id = $1
     RETURNING *`,
    [
      id, m.name, J(m.food_groups), J(m.protein), m.method || null,
      m.cuisine || null, J(m.flavor), !!m.carb_in_dish, J(m.ingredients),
      J(m.staples_used), J(m.steps), J(m.gates),
      m.image?.emoji || null, m.image?.url || null,
    ]
  )
  return rows[0] ? toMenu(rows[0]) : null
}

// ลบเมนู — ใครก็ลบได้ (public wiki). คืน true ถ้าลบจริง
export async function deleteMenu(id) {
  const { rowCount } = await pool.query(
    `DELETE FROM cooking_menus WHERE id = $1`,
    [id]
  )
  return rowCount > 0
}
