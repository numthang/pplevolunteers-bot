import pool from '../index.js'

// custom ingredient tokens a user adds themselves (beyond the 44-slot canonical checklist)

export async function getIngredients(owner) {
  const { rows } = await pool.query(
    `SELECT id, token, label, grp, tier FROM cooking_ingredients WHERE owner = $1 ORDER BY id`,
    [owner]
  )
  return rows
}

// returns the inserted row, or null if (owner, token) already exists
export async function addIngredient(owner, { token, label, grp, tier = 'regular' }) {
  const { rows } = await pool.query(
    `INSERT INTO cooking_ingredients (owner, token, label, grp, tier)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (owner, token) DO NOTHING
     RETURNING id, token, label, grp, tier`,
    [owner, token, label, grp, tier]
  )
  return rows[0] || null
}

// only the owner can delete their own custom ingredient
export async function deleteIngredient(owner, id) {
  const { rowCount } = await pool.query(
    `DELETE FROM cooking_ingredients WHERE id = $1 AND owner = $2`,
    [id, owner]
  )
  return rowCount > 0
}
