import pool from '../index.js'

export async function getTransactions(guildId, { accountId, type, categoryId, noCategory, search, year, month, dateFrom, dateTo, limit = 50, offset = 0, discordId = null, admin = false } = {}) {
  let where = 'WHERE t.guild_id = ?'
  const params = [guildId]

  // Private accounts: only owner can see — even admin cannot
  where += ' AND (a.visibility != ? OR a.owner_id = ?)'
  params.push('private', discordId)

  if (accountId)  { where += ' AND t.account_id = ?';   params.push(accountId) }
  if (type)       { where += ' AND t.type = ?';         params.push(type) }
  if (categoryId) { where += ' AND t.category_id = ?';  params.push(categoryId) }
  if (noCategory) { where += ' AND t.category_id IS NULL' }
  if (search)     { where += ' AND (t.description LIKE ? OR t.counterpart_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  if (year)       { where += ' AND YEAR(t.txn_at) = ?';  params.push(year) }
  if (month)      { where += ' AND MONTH(t.txn_at) = ?'; params.push(month) }
  if (dateFrom)   { where += ' AND DATE(t.txn_at) >= ?'; params.push(dateFrom) }
  if (dateTo)     { where += ' AND DATE(t.txn_at) <= ?'; params.push(dateTo) }

  const [rows] = await pool.query(
    `SELECT t.*, a.name AS account_name, a.bank AS account_bank, a.owner_id AS account_owner_id, a.visibility AS account_visibility, a.province AS account_province, c.name AS category_name, c.icon AS category_icon
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
     txn_at ? new Date(txn_at).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' '), updatedBy]
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
     evidence_url || null, txn_at || null, updatedBy, id]
  )
}

export async function deleteTransaction(id) {
  await pool.query(`DELETE FROM finance_transactions WHERE id = ?`, [id])
}

export async function getCategorySummary(guildId, { accountId, type, year, month, dateFrom, dateTo } = {}) {
  let where = 'WHERE t.guild_id = ?'
  const params = [guildId]

  if (accountId) { where += ' AND t.account_id = ?';  params.push(accountId) }
  if (type)      { where += ' AND t.type = ?';         params.push(type) }
  if (year)      { where += ' AND YEAR(t.txn_at) = ?'; params.push(year) }
  if (month)     { where += ' AND MONTH(t.txn_at) = ?'; params.push(month) }
  if (dateFrom)  { where += ' AND DATE(t.txn_at) >= ?'; params.push(dateFrom) }
  if (dateTo)    { where += ' AND DATE(t.txn_at) <= ?'; params.push(dateTo) }

  const [rows] = await pool.query(
    `SELECT
       c.id        AS category_id,
       c.name      AS category_name,
       c.icon      AS category_icon,
       t.type,
       SUM(t.amount) AS total,
       COUNT(*)      AS count
     FROM finance_transactions t
     LEFT JOIN finance_categories c ON c.id = t.category_id
     ${where}
     GROUP BY c.id, c.name, c.icon, t.type
     ORDER BY total DESC`,
    params
  )
  return rows
}

export async function getMonthlyTrend(guildId, { accountId, type, year } = {}) {
  let where = 'WHERE t.guild_id = ?'
  const params = [guildId]

  if (accountId) { where += ' AND t.account_id = ?';  params.push(accountId) }
  if (type)      { where += ' AND t.type = ?';         params.push(type) }
  if (year)      { where += ' AND YEAR(t.txn_at) = ?'; params.push(year) }

  const [rows] = await pool.query(
    `SELECT
       YEAR(t.txn_at)  AS year,
       MONTH(t.txn_at) AS month,
       t.type,
       SUM(t.amount)   AS total,
       COUNT(*)        AS count
     FROM finance_transactions t
     ${where}
     GROUP BY YEAR(t.txn_at), MONTH(t.txn_at), t.type
     ORDER BY year DESC, month DESC`,
    params
  )
  return rows
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

export async function getBalanceSummary(guildId, accountId) {
  // SUM balance
  const [sumRows] = await pool.query(
    `SELECT
       SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS total_income,
       SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS total_expense,
       SUM(CASE WHEN type='income'  THEN amount ELSE -amount END) AS net
     FROM finance_transactions
     WHERE guild_id = ? AND account_id = ?`,
    [guildId, accountId]
  )

  // latest balance_after
  const [balRows] = await pool.query(
    `SELECT balance_after, txn_at
     FROM finance_transactions
     WHERE guild_id = ? AND account_id = ? AND balance_after IS NOT NULL
     ORDER BY txn_at DESC LIMIT 1`,
    [guildId, accountId]
  )

  // reconciliation gaps: consecutive rows with balance_after where diff ≠ amount
  const [txnRows] = await pool.query(
    `SELECT id, type, amount, balance_after, txn_at
     FROM finance_transactions
     WHERE guild_id = ? AND account_id = ? AND balance_after IS NOT NULL
     ORDER BY txn_at ASC`,
    [guildId, accountId]
  )

  const gaps = []
  for (let i = 1; i < txnRows.length; i++) {
    const prev = txnRows[i - 1]
    const curr = txnRows[i]
    const expectedDiff = curr.type === 'income' ? Number(curr.amount) : -Number(curr.amount)
    const actualDiff   = Number(curr.balance_after) - Number(prev.balance_after)
    if (actualDiff < expectedDiff - 0.01) {
      gaps.push({ from: prev.txn_at, to: curr.txn_at })
    }
  }

  return {
    ...sumRows[0],
    balance_after: balRows[0]?.balance_after ?? null,
    balance_after_at: balRows[0]?.txn_at ?? null,
    has_balance_after: balRows.length > 0,
    gap_count: gaps.length,
    gaps: gaps.slice(0, 10),
  }
}
