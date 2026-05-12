// db/gogo.js
const pool = require('./index');

async function getEntries(guildId, messageId) {
  const [rows] = await pool.execute(
    `SELECT user_id, name, joined_at FROM dc_gogo_entries
     WHERE guild_id = ? AND message_id = ?
     ORDER BY joined_at, id`,
    [guildId, messageId]
  );
  return rows;
}

async function hasPanel(guildId, messageId) {
  const [rows] = await pool.execute(
    'SELECT 1 FROM dc_gogo_entries WHERE guild_id = ? AND message_id = ? LIMIT 1',
    [guildId, messageId]
  );
  return rows.length > 0;
}

// เปลี่ยน entries ของ user คนนี้ (delete + re-insert) — names = [] หมายถึงออก
async function upsertEntries(guildId, messageId, userId, names) {
  await pool.execute(
    'DELETE FROM dc_gogo_entries WHERE guild_id = ? AND message_id = ? AND user_id = ?',
    [guildId, messageId, userId]
  );
  if (!names.length) return;
  for (const name of names) {
    await pool.execute(
      'INSERT INTO dc_gogo_entries (guild_id, message_id, user_id, name) VALUES (?, ?, ?, ?)',
      [guildId, messageId, userId, name]
    );
  }
}

// lazy migration — seed entries จาก embed field ที่ parse ได้
async function seedEntries(guildId, messageId, entries) {
  for (const { userId, name } of entries) {
    await pool.execute(
      'INSERT IGNORE INTO dc_gogo_entries (guild_id, message_id, user_id, name) VALUES (?, ?, ?, ?)',
      [guildId, messageId, userId, name ?? '']
    );
  }
}

module.exports = { getEntries, hasPanel, upsertEntries, seedEntries };
