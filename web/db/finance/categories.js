import pool from '../index.js'

export async function getCategories(guildId, ownerId) {
  const { rows } = await pool.query(
    `SELECT * FROM finance_categories
     WHERE is_global = 1
        OR (guild_id = $1 AND owner_id = $2)
     ORDER BY is_global DESC, usage_count DESC, name ASC`,
    [guildId, ownerId]
  )
  return rows
}

export async function getCategoriesAll(guildId) {
  // Admin only
  const { rows } = await pool.query(
    `SELECT * FROM finance_categories
     WHERE guild_id = $1 OR is_global = 1
     ORDER BY is_global DESC, usage_count DESC, name ASC`,
    [guildId]
  )
  return rows
}

export async function getCategoryById(id) {
  const { rows } = await pool.query(`SELECT * FROM finance_categories WHERE id = $1`, [id])
  return rows[0] || null
}

export async function createCategory(guildId, ownerId, name, icon = null, isGlobal = false) {
  const { rows } = await pool.query(
    `INSERT INTO finance_categories (guild_id, owner_id, name, icon, is_global) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [guildId, isGlobal ? null : ownerId, name, icon || null, isGlobal ? 1 : 0]
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
