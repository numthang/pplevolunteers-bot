// db/gogo.js
// roster ของ gogo panel — key ด้วย session_id (mint ตอนสร้าง panel)
// นิ่งข้าม sticky repost (message_id churn ทุก repost), แยกต่อ event, เก็บ log ได้
const pool = require('./index');

async function getEntries(guildId, sessionId) {
  const { rows } = await pool.query(
    `SELECT user_id, name, joined_at FROM dc_gogo_entries
     WHERE guild_id = $1 AND session_id = $2
     ORDER BY joined_at, id`,
    [guildId, sessionId]
  );
  return rows;
}

// เปลี่ยน entries ของ user คนนี้ (delete + re-insert) — names = [] หมายถึงออก
async function upsertEntries(guildId, sessionId, userId, names) {
  await pool.query(
    'DELETE FROM dc_gogo_entries WHERE guild_id = $1 AND session_id = $2 AND user_id = $3',
    [guildId, sessionId, userId]
  );
  if (!names.length) return;
  for (const name of names) {
    await pool.query(
      'INSERT INTO dc_gogo_entries (guild_id, message_id, session_id, user_id, name) VALUES ($1, $2, $2, $3, $4)',
      [guildId, sessionId, userId, name]
    );
  }
}

module.exports = { getEntries, upsertEntries };
