import pool from '../index.js'

// cooking_menus: seed 121 (owner NULL = ระบบ) + เมนู import ของผู้ใช้ (owner = uid).
// ทุกเมนู public — เห็นได้หมด. JSONB columns มาจาก pg เป็น JS object แล้ว (ไม่ต้อง parse).

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

// แก้เมนู — เฉพาะเจ้าของเท่านั้น (owner ต้องตรง, seed แก้ไม่ได้)
export async function updateMenu(id, owner, m) {
  const { rows } = await pool.query(
    `UPDATE cooking_menus SET
       name = $3, food_groups = $4, protein = $5, method = $6, cuisine = $7,
       flavor = $8, carb_in_dish = $9, ingredients = $10, staples_used = $11,
       steps = $12, gates = $13, image_emoji = $14, image_url = $15
     WHERE id = $1 AND owner = $2
     RETURNING *`,
    [
      id, owner, m.name, J(m.food_groups), J(m.protein), m.method || null,
      m.cuisine || null, J(m.flavor), !!m.carb_in_dish, J(m.ingredients),
      J(m.staples_used), J(m.steps), J(m.gates),
      m.image?.emoji || null, m.image?.url || null,
    ]
  )
  return rows[0] ? toMenu(rows[0]) : null
}

// ลบเมนู — เฉพาะเจ้าของ. คืน true ถ้าลบจริง
export async function deleteMenu(id, owner) {
  const { rowCount } = await pool.query(
    `DELETE FROM cooking_menus WHERE id = $1 AND owner = $2`,
    [id, owner]
  )
  return rowCount > 0
}
