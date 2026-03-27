// db/settings.js 
const pool = require('./index');

async function setSetting(guildId, key, value) {
    const sql = `INSERT INTO dc_server_settings (guild_id, setting_key, setting_value) 
                 VALUES (?, ?, ?) 
                 ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`;
    await pool.execute(sql, [guildId, key, JSON.stringify(value)]);
}

async function getSetting(guildId, key) {
    const [rows] = await pool.execute(
        'SELECT setting_value FROM dc_server_settings WHERE guild_id = ? AND setting_key = ?', 
        [guildId, key]
    );
    return rows[0]?.setting_value || null;
}

// ฟังก์ชันสำหรับลบการตั้งค่า
async function deleteSetting(guildId, key) {
    const connection = await pool.getConnection();
    try {
        await connection.query(
            'DELETE FROM dc_server_settings WHERE guild_id = ? AND setting_key = ?',
            [guildId, key]
        );
        return true;
    } catch (error) {
        console.error('Error in deleteSetting:', error);
        throw error;
    } finally {
        connection.release();
    }
}

// อย่าลืมเพิ่ม deleteSetting ลงใน module.exports ด้วยนะครับ
module.exports = {
    getSetting,
    setSetting,
    deleteSetting // เพิ่มตัวนี้เข้าไป
};