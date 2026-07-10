import pool from '../index.js'

// cooking_history: one row per "ทำแล้ว" tap. Used for variety scoring (avoid repeats).
// owner = discord user id.

export async function addCooked(owner, menuId) {
  await pool.query(
    `INSERT INTO cooking_history (owner, menu_id) VALUES ($1, $2)`,
    [owner, menuId]
  )
}

// menu ids cooked within the last `days` days, newest first
export async function getRecentCooked(owner, days = 3) {
  const { rows } = await pool.query(
    `SELECT menu_id, cooked_at FROM cooking_history
     WHERE owner = $1 AND cooked_at >= NOW() - ($2 || ' days')::interval
     ORDER BY cooked_at DESC`,
    [owner, String(days)]
  )
  return rows
}
