// db/otpSession.js — state ชั่วคราวของการยืนยันตัวตนด้วย OTP (dc_user_config)
// แยกออกจาก db/userConfig.js ตอนแปลง prefs → user_config (2026-07-29)
//
// ทำไมยัง key ด้วย discord_id: ตอนคนกดยืนยันตัวตน users row **อาจยังไม่เกิด**
// ถ้าไปผูก users.id จะกลายเป็นต้องสร้าง users ให้คนที่ยังพิสูจน์ตัวไม่ผ่าน
//
// keys ที่ใช้: `otp_quota` (โควตาส่ง SMS ต่อวัน) · `otp_verify_<guildId>` (session ระหว่างกรอกรหัส)
const pool = require('./index');

async function setOtpState(discordId, key, value) {
    await pool.query(
        `INSERT INTO dc_user_config (discord_id, "key", value)
         VALUES ($1, $2, $3)
         ON CONFLICT (discord_id, "key") DO UPDATE SET
           value = EXCLUDED.value,
           updated_at = CURRENT_TIMESTAMP`,
        [discordId, key, JSON.stringify(value)]
    );
}

async function getOtpState(discordId, key) {
    const { rows } = await pool.query(
        'SELECT value FROM dc_user_config WHERE discord_id = $1 AND "key" = $2',
        [discordId, key]
    );
    return rows[0]?.value ?? null;
}

async function deleteOtpState(discordId, key) {
    await pool.query(
        'DELETE FROM dc_user_config WHERE discord_id = $1 AND "key" = $2',
        [discordId, key]
    );
    return true;
}

module.exports = { getOtpState, setOtpState, deleteOtpState };
