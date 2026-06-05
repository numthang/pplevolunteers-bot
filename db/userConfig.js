// db/userConfig.js — per-user settings (dc_user_config)
// คู่ขนานกับ db/settings.js (per-guild) — แยกตารางเพราะ guild_id เป็น VARCHAR(20)
// ใส่ user_<discordId> (24 ตัว) ไม่ได้
const pool = require('./index');

async function setUserSetting(discordId, key, value) {
    const sql = `INSERT INTO dc_user_config (discord_id, "key", value)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (discord_id, "key") DO UPDATE SET
                   value = EXCLUDED.value,
                   updated_at = CURRENT_TIMESTAMP`;
    await pool.query(sql, [discordId, key, JSON.stringify(value)]);
}

async function getUserSetting(discordId, key) {
    const { rows } = await pool.query(
        'SELECT value FROM dc_user_config WHERE discord_id = $1 AND "key" = $2',
        [discordId, key]
    );
    return rows[0]?.value ?? null;
}

async function deleteUserSetting(discordId, key) {
    await pool.query(
        'DELETE FROM dc_user_config WHERE discord_id = $1 AND "key" = $2',
        [discordId, key]
    );
    return true;
}

module.exports = {
    getUserSetting,
    setUserSetting,
    deleteUserSetting,
};
