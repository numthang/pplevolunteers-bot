import pool from '../index.js'

// org-scope: guild_id→org_id · owner_id = users.id (INT) · ownerId param = userId

export async function getCategories(orgId, ownerId) {
  const { rows } = await pool.query(
    `SELECT * FROM finance_categories
     WHERE is_global = 1
        OR (org_id = $1 AND owner_id = $2)
     ORDER BY is_global DESC, usage_count DESC, name ASC`,
    [orgId, ownerId]
  )
  return rows
}

export async function getCategoriesAll(orgId) {
  // Admin only
  const { rows } = await pool.query(
    `SELECT * FROM finance_categories
     WHERE org_id = $1 OR is_global = 1
     ORDER BY is_global DESC, usage_count DESC, name ASC`,
    [orgId]
  )
  return rows
}

export async function getCategoryById(id) {
  const { rows } = await pool.query(`SELECT * FROM finance_categories WHERE id = $1`, [id])
  return rows[0] || null
}

export async function createCategory(orgId, ownerId, name, icon = null, isGlobal = false) {
  const { rows } = await pool.query(
    `INSERT INTO finance_categories (org_id, owner_id, name, icon, is_global) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [isGlobal ? null : orgId, isGlobal ? null : ownerId, name, icon || null, isGlobal ? 1 : 0]
  )
  return rows[0].id
}

export async function updateCategory(id, name, icon, isGlobal, ownerId) {
  await pool.query(
    `UPDATE finance_categories SET name = $1, icon = $2, is_global = $3, owner_id = $4 WHERE id = $5`,
    [name, icon || null, isGlobal ? 1 : 0, isGlobal ? null : ownerId, id]
  )
}

export async function deleteCategory(id) {
  await pool.query(`DELETE FROM finance_categories WHERE id = $1`, [id])
}

export async function incrementUsageCount(id) {
  await pool.query(`UPDATE finance_categories SET usage_count = usage_count + 1 WHERE id = $1`, [id])
}
