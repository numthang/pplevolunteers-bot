const pool = require('./index')

async function getFinanceConfig(guildId) {
  const [rows] = await pool.query(
    `SELECT * FROM finance_config WHERE guild_id = ?`, [guildId]
  )
  return rows[0] || null
}

async function upsertFinanceConfig(guildId, data) {
  const { channel_id, thread_id, account_ids, dashboard_msg_id } = data
  const accountIdsStr = Array.isArray(account_ids) ? account_ids.join(',') : account_ids || null
  await pool.query(
    `INSERT INTO finance_config (guild_id, channel_id, thread_id, account_ids, dashboard_msg_id, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       channel_id       = COALESCE(VALUES(channel_id),       channel_id),
       thread_id        = COALESCE(VALUES(thread_id),        thread_id),
       account_ids      = COALESCE(VALUES(account_ids),      account_ids),
       dashboard_msg_id = COALESCE(VALUES(dashboard_msg_id), dashboard_msg_id),
       updated_at       = NOW()`,
    [guildId, channel_id || null, thread_id || null, accountIdsStr, dashboard_msg_id || null]
  )
}

async function getAccountsSummary(guildId, accountIds = []) {
  let where = `WHERE a.guild_id = ?`
  const params = [guildId]

  if (accountIds.length) {
    where += ` AND a.id IN (${accountIds.map(() => '?').join(',')})`
    params.push(...accountIds)
  } else {
    where += ` AND a.visibility IN ('internal', 'public')`
  }

  const [rows] = await pool.query(
    `SELECT a.id, a.name, a.bank, a.account_no, a.visibility,
       COALESCE(SUM(CASE WHEN t.type='income'  THEN t.amount ELSE 0 END), 0) AS total_income,
       COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END), 0) AS total_expense
     FROM finance_accounts a
     LEFT JOIN finance_transactions t ON t.account_id = a.id
     ${where}
     GROUP BY a.id`,
    params
  )
  return rows
}

module.exports = { getFinanceConfig, upsertFinanceConfig, getAccountsSummary }
