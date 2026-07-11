import pool from '../index.js'

// pantry rows: (kitchen_id, ingredient) with status 'have' | 'out'. No row = neutral (don't have).
// kitchen_id = คนหลายคนช่วยกันจัดการครัวเดียวกันได้ (ไม่ใช่ owner คนเดียวเหมือนเดิม)

export async function getPantry(kitchenId) {
  const { rows } = await pool.query(
    `SELECT ingredient, status FROM cooking_pantry WHERE kitchen_id = $1`,
    [kitchenId]
  )
  return rows
}

// upsert a token to 'have' or 'out'
export async function setPantry(kitchenId, ingredient, status) {
  await pool.query(
    `INSERT INTO cooking_pantry (kitchen_id, ingredient, status, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (kitchen_id, ingredient)
     DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
    [kitchenId, ingredient, status]
  )
}

// remove the row entirely → back to neutral (not have, not on market list)
export async function clearPantry(kitchenId, ingredient) {
  await pool.query(
    `DELETE FROM cooking_pantry WHERE kitchen_id = $1 AND ingredient = $2`,
    [kitchenId, ingredient]
  )
}
