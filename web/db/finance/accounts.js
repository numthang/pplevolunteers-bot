import pool from '../index.js'

export async function getPublicAccounts(guildId) {
  const [rows] = await pool.query(
    `SELECT * FROM finance_accounts WHERE guild_id = ? AND visibility = 'public' AND archived = 0 ORDER BY usage_count DESC`,
    [guildId]
  )
  return rows
}

export async function getAccountsForUser(guildId, discordId) {
  const [rows] = await pool.query(
    `SELECT * FROM finance_accounts
     WHERE guild_id = ?
       AND archived = 0
       AND (owner_id = ? OR visibility = 'public' OR visibility = 'internal')
     ORDER BY usage_count DESC, name ASC`,
    [guildId, discordId]
  )
  return rows
}

export async function getAccountsAll(guildId, discordId, admin = false) {
  const [rows] = await pool.query(
    `SELECT * FROM finance_accounts
     WHERE (? = 1 OR owner_id = ? OR visibility != 'private')
     ORDER BY archived ASC, usage_count DESC, name ASC`,
    [admin ? 1 : 0, discordId]
  )
  return rows
}

export async function archiveAccount(id, archived) {
  await pool.query(`UPDATE finance_accounts SET archived = ? WHERE id = ?`, [archived ? 1 : 0, id])
}

export async function getAccountById(id) {
  const [rows] = await pool.query(`SELECT * FROM finance_accounts WHERE id = ?`, [id])
  return rows[0] || null
}

export async function createAccount(guildId, data, updatedBy) {
  const { name, bank, account_no, visibility, province, notify_income, notify_expense, email_inbox } = data
  const cleanAccountNo = (account_no || '').replace(/-/g, '')
  const [result] = await pool.query(
    `INSERT INTO finance_accounts
      (guild_id, owner_id, name, bank, account_no, visibility, province, notify_income, notify_expense, email_inbox, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [guildId, updatedBy, name, bank || null, cleanAccountNo || null,
     visibility || 'private', province || null,
     notify_income ?? 1, notify_expense ?? 1, email_inbox || null, updatedBy]
  )
  return result.insertId
}

export async function updateAccount(id, data, updatedBy, allowGuildChange = false) {
  const { name, bank, account_no, visibility, province, notify_income, notify_expense, email_inbox, guild_id } = data
  const cleanAccountNo = (account_no || '').replace(/-/g, '')

  if (allowGuildChange && guild_id) {
    await pool.query(
      `UPDATE finance_accounts
       SET guild_id=?, name=?, bank=?, account_no=?, visibility=?, province=?, notify_income=?, notify_expense=?,
           email_inbox=?, updated_by=?, updated_at=NOW()
       WHERE id=?`,
      [guild_id, name, bank || null, cleanAccountNo || null, visibility, province || null,
       notify_income, notify_expense, email_inbox || null, updatedBy, id]
    )
    await pool.query(
      `UPDATE finance_transactions SET guild_id=? WHERE account_id=?`,
      [guild_id, id]
    )
  } else {
    await pool.query(
      `UPDATE finance_accounts
       SET name=?, bank=?, account_no=?, visibility=?, province=?, notify_income=?, notify_expense=?,
           email_inbox=?, updated_by=?, updated_at=NOW()
       WHERE id=?`,
      [name, bank || null, cleanAccountNo || null, visibility, province || null,
       notify_income, notify_expense, email_inbox || null, updatedBy, id]
    )
  }
}

export async function deleteAccount(id) {
  await pool.query(`DELETE FROM finance_accounts WHERE id = ?`, [id])
}

export async function incrementUsageCount(id) {
  await pool.query(`UPDATE finance_accounts SET usage_count = usage_count + 1 WHERE id = ?`, [id])
}
