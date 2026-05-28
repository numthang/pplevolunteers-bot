const pool = require('./index')

async function getFinanceConfig(guildId) {
  const { rows } = await pool.query(
    `SELECT * FROM finance_config WHERE guild_id = $1`, [guildId]
  )
  return rows[0] || null
}

async function upsertFinanceConfig(guildId, data) {
  const { channel_id, thread_id, account_ids, dashboard_msg_id } = data
  const accountIdsStr = Array.isArray(account_ids) ? account_ids.join(',') : account_ids || null
  await pool.query(
    `INSERT INTO finance_config (guild_id, channel_id, thread_id, account_ids, dashboard_msg_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (guild_id) DO UPDATE SET
       channel_id       = COALESCE(EXCLUDED.channel_id,       finance_config.channel_id),
       thread_id        = COALESCE(EXCLUDED.thread_id,        finance_config.thread_id),
       account_ids      = COALESCE(EXCLUDED.account_ids,      finance_config.account_ids),
       dashboard_msg_id = COALESCE(EXCLUDED.dashboard_msg_id, finance_config.dashboard_msg_id),
       updated_at       = NOW()`,
    [guildId, channel_id || null, thread_id || null, accountIdsStr, dashboard_msg_id || null]
  )
}

async function getAccountsSummary(guildId, accountIds = []) {
  let where = `WHERE a.guild_id = $1`
  const params = [guildId]

  if (accountIds.length) {
    params.push(accountIds)
    where += ` AND a.id = ANY($${params.length})`
  } else {
    where += ` AND a.visibility IN ('internal', 'public')`
  }

  const { rows } = await pool.query(
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
