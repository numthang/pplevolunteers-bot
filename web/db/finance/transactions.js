import pool from '../index.js'

export async function getTransactions(guildId, { accountId, type, categoryId, noCategory, fundId, noFund, search, year, month, dateFrom, dateTo, limit = 50, offset = 0, discordId = null, admin = false } = {}) {
  const params = []

  // Private accounts: only owner can see — even admin cannot
  params.push('private', discordId)
  let where = `WHERE (a.visibility != $${params.length - 1} OR a.owner_id = $${params.length})`

  if (accountId)  { params.push(accountId);             where += ` AND t.account_id = $${params.length}` }
  if (type)       { params.push(type);                   where += ` AND t.type = $${params.length}` }
  if (categoryId) { params.push(categoryId);             where += ` AND t.category_id = $${params.length}` }
  if (noCategory) {                                      where += ` AND t.category_id IS NULL` }
  if (fundId)     { params.push(fundId);                 where += ` AND t.fund_id = $${params.length}` }
  if (noFund)     {                                      where += ` AND t.fund_id IS NULL` }
  if (search)     { params.push(`%${search}%`, `%${search}%`); where += ` AND (t.description ILIKE $${params.length - 1} OR t.counterpart_name ILIKE $${params.length})` }
  if (year)       { params.push(year);                   where += ` AND EXTRACT(YEAR  FROM t.txn_at) = $${params.length}` }
  if (month)      { params.push(month);                  where += ` AND EXTRACT(MONTH FROM t.txn_at) = $${params.length}` }
  if (dateFrom)   { params.push(dateFrom);               where += ` AND t.txn_at::date >= $${params.length}` }
  if (dateTo)     { params.push(dateTo);                 where += ` AND t.txn_at::date <= $${params.length}` }

  params.push(limit, offset)
  const { rows } = await pool.query(
    `SELECT t.*, a.name AS account_name, a.bank AS account_bank, a.owner_id AS account_owner_id, a.visibility AS account_visibility, a.province AS account_province, c.name AS category_name, c.icon AS category_icon, f.name AS fund_name
     FROM finance_transactions t
     LEFT JOIN finance_accounts a ON a.id = t.account_id
     LEFT JOIN finance_categories c ON c.id = t.category_id
     LEFT JOIN finance_funds f ON f.id = t.fund_id
     ${where}
     ORDER BY t.txn_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )
  return rows
}

export async function getTransactionById(id) {
  const { rows } = await pool.query(
    `SELECT * FROM finance_transactions WHERE id = $1`,
    [id]
  )
  return rows[0] || null
}

export async function createTransaction(guildId, data, updatedBy) {
  const { account_id, type, amount, description, category_id, fund_id, counterpart_name, counterpart_account, counterpart_bank, fee, balance_after, evidence_url, ref_id, discord_msg_id, txn_at } = data
  const { rows } = await pool.query(
    `INSERT INTO finance_transactions
      (guild_id, account_id, type, amount, description, category_id, fund_id, counterpart_name, counterpart_account, counterpart_bank, fee, balance_after, evidence_url, ref_id, discord_msg_id, txn_at, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
     RETURNING id`,
    [guildId, account_id, type, amount, description, category_id || null, fund_id || null,
     counterpart_name || null, counterpart_account || null, counterpart_bank || null,
     fee || null, balance_after || null,
     evidence_url || null, ref_id || null, discord_msg_id || null,
     txn_at || null, updatedBy]
  )
  return rows[0].id
}

export async function updateTransaction(id, data, updatedBy) {
  const { account_id, type, amount, description, category_id, fund_id, counterpart_name, counterpart_account, counterpart_bank, fee, balance_after, evidence_url, txn_at } = data
  await pool.query(
    `UPDATE finance_transactions
     SET account_id=$1, type=$2, amount=$3, description=$4, category_id=$5, fund_id=$6,
         counterpart_name=$7, counterpart_account=$8, counterpart_bank=$9,
         fee=$10, balance_after=$11, evidence_url=$12, txn_at=$13, updated_by=$14, updated_at=NOW()
     WHERE id=$15`,
    [account_id, type, amount, description, category_id || null, fund_id || null,
     counterpart_name || null, counterpart_account || null, counterpart_bank || null,
     fee || null, balance_after || null,
     evidence_url || null, txn_at || null, updatedBy, id]
  )
}

export async function deleteTransaction(id) {
  await pool.query(`DELETE FROM finance_transactions WHERE id = $1`, [id])
}

export async function getCategorySummary(guildId, { accountId, type, year, month, dateFrom, dateTo } = {}) {
  const params = []
  let where = `WHERE 1=1`

  if (accountId) { params.push(accountId); where += ` AND t.account_id = $${params.length}` }
  if (type)      { params.push(type);       where += ` AND t.type = $${params.length}` }
  if (year)      { params.push(year);       where += ` AND EXTRACT(YEAR  FROM t.txn_at) = $${params.length}` }
  if (month)     { params.push(month);      where += ` AND EXTRACT(MONTH FROM t.txn_at) = $${params.length}` }
  if (dateFrom)  { params.push(dateFrom);   where += ` AND t.txn_at::date >= $${params.length}` }
  if (dateTo)    { params.push(dateTo);     where += ` AND t.txn_at::date <= $${params.length}` }

  const { rows } = await pool.query(
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
  const params = []
  let where = `WHERE 1=1`

  if (accountId) { params.push(accountId); where += ` AND t.account_id = $${params.length}` }
  if (type)      { params.push(type);       where += ` AND t.type = $${params.length}` }
  if (year)      { params.push(year);       where += ` AND EXTRACT(YEAR FROM t.txn_at) = $${params.length}` }

  const { rows } = await pool.query(
    `SELECT
       EXTRACT(YEAR  FROM t.txn_at)::int AS year,
       EXTRACT(MONTH FROM t.txn_at)::int AS month,
       t.type,
       SUM(t.amount)   AS total,
       COUNT(*)        AS count
     FROM finance_transactions t
     ${where}
     GROUP BY EXTRACT(YEAR FROM t.txn_at), EXTRACT(MONTH FROM t.txn_at), t.type
     ORDER BY year DESC, month DESC`,
    params
  )
  return rows
}

export async function getAccountSummary(guildId, accountId) {
  const { rows } = await pool.query(
    `SELECT
       SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS total_income,
       SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS total_expense
     FROM finance_transactions
     WHERE account_id = $1`,
    [accountId]
  )
  return rows[0]
}

export async function getBalanceSummary(guildId, accountId) {
  // SUM balance
  const { rows: sumRows } = await pool.query(
    `SELECT
       SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS total_income,
       SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS total_expense,
       SUM(CASE WHEN type='income'  THEN amount ELSE -amount END) AS net
     FROM finance_transactions
     WHERE account_id = $1`,
    [accountId]
  )

  // latest balance_after
  const { rows: balRows } = await pool.query(
    `SELECT balance_after, txn_at
     FROM finance_transactions
     WHERE account_id = $1 AND balance_after IS NOT NULL
     ORDER BY txn_at DESC LIMIT 1`,
    [accountId]
  )

  // reconciliation gaps: consecutive rows with balance_after where diff ≠ amount
  const { rows: txnRows } = await pool.query(
    `SELECT id, type, amount, balance_after, txn_at
     FROM finance_transactions
     WHERE account_id = $1 AND balance_after IS NOT NULL
     ORDER BY txn_at ASC`,
    [accountId]
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
