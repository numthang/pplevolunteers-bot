import pool from '../index.js'

export async function getFunds(accountId) {
  const { rows } = await pool.query(
    `SELECT * FROM finance_funds WHERE account_id = $1 ORDER BY id ASC`,
    [accountId]
  )
  return rows
}

export async function createFund(accountId, name) {
  const { rows } = await pool.query(
    `INSERT INTO finance_funds (account_id, name) VALUES ($1, $2) RETURNING id`,
    [accountId, name]
  )
  return rows[0].id
}

export async function deleteFund(id) {
  await pool.query(`UPDATE finance_transactions SET fund_id = NULL WHERE fund_id = $1`, [id])
  await pool.query(`DELETE FROM finance_funds WHERE id = $1`, [id])
}

export async function getFundBalances(accountId) {
  const { rows: funds } = await pool.query(
    `SELECT
       f.id,
       f.name,
       SUM(CASE WHEN t.type='income'  THEN t.amount ELSE 0 END) AS total_income,
       SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END) AS total_expense,
       SUM(CASE WHEN t.type='income'  THEN t.amount ELSE -t.amount END) AS net,
       COUNT(t.id) AS count
     FROM finance_funds f
     LEFT JOIN finance_transactions t ON t.fund_id = f.id AND t.account_id = $1
     WHERE f.account_id = $2
     GROUP BY f.id, f.name
     ORDER BY f.id ASC`,
    [accountId, accountId]
  )
  const { rows: untaggedRows } = await pool.query(
    `SELECT
       SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS total_income,
       SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS total_expense,
       SUM(CASE WHEN type='income'  THEN amount ELSE -amount END) AS net,
       COUNT(*) AS count
     FROM finance_transactions
     WHERE account_id = $1 AND fund_id IS NULL`,
    [accountId]
  )
  return { funds, untagged: untaggedRows[0] }
}
