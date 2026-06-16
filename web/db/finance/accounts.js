import pool from '../index.js'

export async function getPublicAccounts(guildId) {
  const { rows } = await pool.query(
    `SELECT * FROM finance_accounts WHERE guild_id = $1 AND visibility = 'public' AND archived = 0 ORDER BY usage_count DESC`,
    [guildId]
  )
  return rows
}

export async function getAccountsForUser(guildId, discordId) {
  const { rows } = await pool.query(
    `SELECT * FROM finance_accounts
     WHERE guild_id = $1
       AND archived = 0
       AND (owner_id = $2 OR visibility = 'public' OR visibility = 'internal')
     ORDER BY usage_count DESC, name ASC`,
    [guildId, discordId]
  )
  return rows
}

export async function getAccountsAll(guildId, discordId, admin = false) {
  const { rows } = await pool.query(
    `SELECT * FROM finance_accounts
     WHERE guild_id = $3
       AND ($1 = 1 OR owner_id = $2 OR visibility != 'private')
     ORDER BY archived ASC, usage_count DESC, name ASC`,
    [admin ? 1 : 0, discordId, guildId]
  )
  return rows
}

export async function archiveAccount(id, archived) {
  await pool.query(`UPDATE finance_accounts SET archived = $1 WHERE id = $2`, [archived ? 1 : 0, id])
}

export async function getAccountById(id) {
  const { rows } = await pool.query(`SELECT * FROM finance_accounts WHERE id = $1`, [id])
  return rows[0] || null
}

export async function createAccount(guildId, data, updatedBy) {
  const { name, bank, account_no, visibility, province, notify_income, notify_expense, email_inbox } = data
  const cleanAccountNo = (account_no || '').replace(/-/g, '')
  const { rows } = await pool.query(
    `INSERT INTO finance_accounts
      (guild_id, owner_id, name, bank, account_no, visibility, province, notify_income, notify_expense, email_inbox, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     RETURNING id`,
    [guildId, updatedBy, name, bank || null, cleanAccountNo || null,
     visibility || 'private', province || null,
     notify_income ?? 1, notify_expense ?? 1, email_inbox || null, updatedBy]
  )
  return rows[0].id
}

export async function updateAccount(id, data, updatedBy, allowGuildChange = false) {
  const { name, bank, account_no, visibility, province, notify_income, notify_expense, email_inbox, guild_id } = data
  const cleanAccountNo = (account_no || '').replace(/-/g, '')

  if (allowGuildChange && guild_id) {
    await pool.query(
      `UPDATE finance_accounts
       SET guild_id=$1, name=$2, bank=$3, account_no=$4, visibility=$5, province=$6, notify_income=$7, notify_expense=$8,
           email_inbox=$9, updated_by=$10, updated_at=NOW()
       WHERE id=$11`,
      [guild_id, name, bank || null, cleanAccountNo || null, visibility, province || null,
       notify_income, notify_expense, email_inbox || null, updatedBy, id]
    )
    await pool.query(
      `UPDATE finance_transactions SET guild_id=$1 WHERE account_id=$2`,
      [guild_id, id]
    )
  } else {
    await pool.query(
      `UPDATE finance_accounts
       SET name=$1, bank=$2, account_no=$3, visibility=$4, province=$5, notify_income=$6, notify_expense=$7,
           email_inbox=$8, updated_by=$9, updated_at=NOW()
       WHERE id=$10`,
      [name, bank || null, cleanAccountNo || null, visibility, province || null,
       notify_income, notify_expense, email_inbox || null, updatedBy, id]
    )
  }
}

export async function deleteAccount(id) {
  await pool.query(`DELETE FROM finance_accounts WHERE id = $1`, [id])
}

export async function incrementUsageCount(id) {
  await pool.query(`UPDATE finance_accounts SET usage_count = usage_count + 1 WHERE id = $1`, [id])
}
