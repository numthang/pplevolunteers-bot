import pool from '../index.js'

export async function getCategories(guildId, ownerId) {
  const [rows] = await pool.query(
    `SELECT * FROM finance_categories
     WHERE is_global = 1
        OR (guild_id = ? AND owner_id = ?)
     ORDER BY is_global DESC, usage_count DESC, name ASC`,
    [guildId, ownerId]
  )
  return rows
}

export async function getCategoriesAll(guildId) {
  // Admin only
  const [rows] = await pool.query(
    `SELECT * FROM finance_categories
     WHERE guild_id = ? OR is_global = 1
     ORDER BY is_global DESC, usage_count DESC, name ASC`,
    [guildId]
  )
  return rows
}

export async function getCategoryById(id) {
  const [rows] = await pool.query(`SELECT * FROM finance_categories WHERE id = ?`, [id])
  return rows[0] || null
}

export async function createCategory(guildId, ownerId, name, icon = null, isGlobal = false) {
  const [result] = await pool.query(
    `INSERT INTO finance_categories (guild_id, owner_id, name, icon, is_global) VALUES (?, ?, ?, ?, ?)`,
    [guildId, isGlobal ? null : ownerId, name, icon || null, isGlobal ? 1 : 0]
  )
  return result.insertId
}

export async function updateCategory(id, name, icon, isGlobal, ownerId) {
  await pool.query(
    `UPDATE finance_categories SET name = ?, icon = ?, is_global = ?, owner_id = ? WHERE id = ?`,
    [name, icon || null, isGlobal ? 1 : 0, isGlobal ? null : ownerId, id]
  )
}

export async function deleteCategory(id) {
  await pool.query(`DELETE FROM finance_categories WHERE id = ?`, [id])
}

export async function incrementUsageCount(id) {
  await pool.query(`UPDATE finance_categories SET usage_count = usage_count + 1 WHERE id = ?`, [id])
}
