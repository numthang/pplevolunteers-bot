import pool from '../index.js'

// cooking_history: one row per "ทำแล้ว" tap. Used for variety scoring (avoid repeats).
// kitchen_id = ใครทำในครัวเดียวกันก็นับรวมกันกันเมนูซ้ำ (ไม่ใช่แยกต่อคน)

export async function addCooked(kitchenId, menuId) {
  await pool.query(
    `INSERT INTO cooking_history (kitchen_id, menu_id) VALUES ($1, $2)`,
    [kitchenId, menuId]
  )
}

// menu ids cooked within the last `days` days, newest first
export async function getRecentCooked(kitchenId, days = 3) {
  const { rows } = await pool.query(
    `SELECT menu_id, cooked_at FROM cooking_history
     WHERE kitchen_id = $1 AND cooked_at >= NOW() - ($2 || ' days')::interval
     ORDER BY cooked_at DESC`,
    [kitchenId, String(days)]
  )
  return rows
}
