// db/settings.js 
const pool = require('./index');

async function setSetting(guildId, key, value) {
    const sql = `INSERT INTO server_settings (guild_id, setting_key, setting_value) 
                 VALUES (?, ?, ?) 
                 ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`;
    await pool.execute(sql, [guildId, key, JSON.stringify(value)]);
}

async function getSetting(guildId, key) {
    const [rows] = await pool.execute(
        'SELECT setting_value FROM server_settings WHERE guild_id = ? AND setting_key = ?', 
        [guildId, key]
    );
    return rows[0]?.setting_value || null;
}

module.exports = { setSetting, getSetting };