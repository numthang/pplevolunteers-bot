// db/settings.js
const pool = require('./index');

async function setSetting(guildId, key, value) {
    const sql = `INSERT INTO dc_guild_config (guild_id, "key", value)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (guild_id, "key") DO UPDATE SET
                   value = EXCLUDED.value,
                   updated_at = CURRENT_TIMESTAMP`;
    await pool.query(sql, [guildId, key, JSON.stringify(value)]);
}

async function getSetting(guildId, key) {
    const { rows } = await pool.query(
        'SELECT value FROM dc_guild_config WHERE guild_id = $1 AND "key" = $2',
        [guildId, key]
    );
    return rows[0]?.value ?? null;
}

async function deleteSetting(guildId, key) {
    try {
        await pool.query(
            'DELETE FROM dc_guild_config WHERE guild_id = $1 AND "key" = $2',
            [guildId, key]
        );
        return true;
    } catch (error) {
        console.error('Error in deleteSetting:', error);
        throw error;
    }
}

async function getEnabledFeatures(guildId) {
    const v = await getSetting(guildId, 'enabled_features');
    return Array.isArray(v) ? v : [];
}

module.exports = {
    getSetting,
    setSetting,
    deleteSetting,
    getEnabledFeatures,
};
