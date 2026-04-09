import pool from '../index.js'

export async function getTransactions(guildId, { accountId, type, categoryId, limit = 50, offset = 0 } = {}) {
  let where = 'WHERE t.guild_id = ?'
  const params = [guildId]

  if (accountId) { where += ' AND t.account_id = ?'; params.push(accountId) }
  if (type)      { where += ' AND t.type = ?';       params.push(type) }
  if (categoryId){ where += ' AND t.category_id = ?'; params.push(categoryId) }

  const [rows] = await pool.query(
    `SELECT t.*, a.name AS account_name, c.name AS category_name
     FROM finance_transactions t
     LEFT JOIN finance_accounts a ON a.id = t.account_id
     LEFT JOIN finance_categories c ON c.id = t.category_id
     ${where}
     ORDER BY t.txn_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  )
  return rows
}

export async function getTransactionById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM finance_transactions WHERE id = ?`,
    [id]
  )
  return rows[0] || null
}

export async function createTransaction(guildId, data, updatedBy) {
  const { account_id, type, amount, description, category_id, counterpart_name, counterpart_account, counterpart_bank, fee, balance_after, evidence_url, ref_id, discord_msg_id, txn_at } = data
  const [result] = await pool.query(
    `INSERT INTO finance_transactions
      (guild_id, account_id, type, amount, description, category_id, counterpart_name, counterpart_account, counterpart_bank, fee, balance_after, evidence_url, ref_id, discord_msg_id, txn_at, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [guildId, account_id, type, amount, description, category_id || null,
     counterpart_name || null, counterpart_account || null, counterpart_bank || null,
     fee || null, balance_after || null,
     evidence_url || null, ref_id || null, discord_msg_id || null,
     txn_at || new Date(), updatedBy]
  )
  return result.insertId
}

export async function updateTransaction(id, data, updatedBy) {
  const { account_id, type, amount, description, category_id, counterpart_name, counterpart_account, counterpart_bank, fee, balance_after, evidence_url, txn_at } = data
  await pool.query(
    `UPDATE finance_transactions
     SET account_id=?, type=?, amount=?, description=?, category_id=?,
         counterpart_name=?, counterpart_account=?, counterpart_bank=?,
         fee=?, balance_after=?, evidence_url=?, txn_at=?, updated_by=?, updated_at=NOW()
     WHERE id=?`,
    [account_id, type, amount, description, category_id || null,
     counterpart_name || null, counterpart_account || null, counterpart_bank || null,
     fee || null, balance_after || null,
     evidence_url || null, txn_at, updatedBy, id]
  )
}

export async function deleteTransaction(id) {
  await pool.query(`DELETE FROM finance_transactions WHERE id = ?`, [id])
}

export async function getAccountSummary(guildId, accountId) {
  const [rows] = await pool.query(
    `SELECT
       SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS total_income,
       SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS total_expense
     FROM finance_transactions
     WHERE guild_id = ? AND account_id = ?`,
    [guildId, accountId]
  )
  return rows[0]
}
