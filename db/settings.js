// db/settings.js
const pool = require('./index');

async function setSetting(guildId, key, value) {
    const sql = `INSERT INTO dc_server_settings (guild_id, setting_key, setting_value)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (guild_id, setting_key) DO UPDATE SET
                   setting_value = EXCLUDED.setting_value`;
    await pool.query(sql, [guildId, key, JSON.stringify(value)]);
}

async function getSetting(guildId, key) {
    const { rows } = await pool.query(
        'SELECT setting_value FROM dc_server_settings WHERE guild_id = $1 AND setting_key = $2',
        [guildId, key]
    );
    return rows[0]?.setting_value || null;
}

async function deleteSetting(guildId, key) {
    try {
        await pool.query(
            'DELETE FROM dc_server_settings WHERE guild_id = $1 AND setting_key = $2',
            [guildId, key]
        );
        return true;
    } catch (error) {
        console.error('Error in deleteSetting:', error);
        throw error;
    }
}

module.exports = {
    getSetting,
    setSetting,
    deleteSetting
};
