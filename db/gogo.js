// db/gogo.js
const pool = require('./index');

async function getEntries(guildId, messageId) {
  const { rows } = await pool.query(
    `SELECT user_id, name, joined_at FROM dc_gogo_entries
     WHERE guild_id = $1 AND message_id = $2
     ORDER BY joined_at, id`,
    [guildId, messageId]
  );
  return rows;
}

async function hasPanel(guildId, messageId) {
  const { rows } = await pool.query(
    'SELECT 1 FROM dc_gogo_entries WHERE guild_id = $1 AND message_id = $2 LIMIT 1',
    [guildId, messageId]
  );
  return rows.length > 0;
}

// เปลี่ยน entries ของ user คนนี้ (delete + re-insert) — names = [] หมายถึงออก
async function upsertEntries(guildId, messageId, userId, names) {
  await pool.query(
    'DELETE FROM dc_gogo_entries WHERE guild_id = $1 AND message_id = $2 AND user_id = $3',
    [guildId, messageId, userId]
  );
  if (!names.length) return;
  for (const name of names) {
    await pool.query(
      'INSERT INTO dc_gogo_entries (guild_id, message_id, user_id, name) VALUES ($1, $2, $3, $4)',
      [guildId, messageId, userId, name]
    );
  }
}

// lazy migration — seed entries จาก embed field ที่ parse ได้
async function seedEntries(guildId, messageId, entries) {
  for (const { userId, name } of entries) {
    await pool.query(
      'INSERT INTO dc_gogo_entries (guild_id, message_id, user_id, name) VALUES ($1, $2, $3, $4)',
      [guildId, messageId, userId, name ?? '']
    );
  }
}

module.exports = { getEntries, hasPanel, upsertEntries, seedEntries };
