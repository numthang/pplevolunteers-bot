import pool from '../index.js'

// pantry rows: (owner, ingredient) with status 'have' | 'out'. No row = neutral (don't have).
// owner = discord user id.

export async function getPantry(owner) {
  const { rows } = await pool.query(
    `SELECT ingredient, status FROM cooking_pantry WHERE owner = $1`,
    [owner]
  )
  return rows
}

// upsert a token to 'have' or 'out'
export async function setPantry(owner, ingredient, status) {
  await pool.query(
    `INSERT INTO cooking_pantry (owner, ingredient, status, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (owner, ingredient)
     DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
    [owner, ingredient, status]
  )
}

// remove the row entirely → back to neutral (not have, not on market list)
export async function clearPantry(owner, ingredient) {
  await pool.query(
    `DELETE FROM cooking_pantry WHERE owner = $1 AND ingredient = $2`,
    [owner, ingredient]
  )
}
