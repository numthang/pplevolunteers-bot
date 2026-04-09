import pool from '../index.js'

export async function getCategories(guildId) {
  const [rows] = await pool.query(
    `SELECT * FROM finance_categories
     WHERE guild_id = ? OR is_global = 1
     ORDER BY usage_count DESC, name ASC`,
    [guildId]
  )
  return rows
}

export async function createCategory(guildId, name) {
  const [result] = await pool.query(
    `INSERT INTO finance_categories (guild_id, name) VALUES (?, ?)`,
    [guildId, name]
  )
  return result.insertId
}

export async function updateCategory(id, name) {
  await pool.query(`UPDATE finance_categories SET name = ? WHERE id = ?`, [name, id])
}

export async function deleteCategory(id) {
  await pool.query(`DELETE FROM finance_categories WHERE id = ?`, [id])
}

export async function incrementCategoryUsage(id) {
  await pool.query(`UPDATE finance_categories SET usage_count = usage_count + 1 WHERE id = ?`, [id])
}
