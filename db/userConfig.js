// db/userConfig.js — prefs ถาวรของ user (ตาราง user_config, key = users.id)
// เดิมคือ dc_user_config ที่ key ด้วย discord_id — แปลง 2026-07-29 (md/posts/POSTS.md)
//
// caller ฝั่งบอทยังส่ง discordId เหมือนเดิม → resolve เป็น users.id ข้างในที่นี่ที่เดียว
// เขียนแล้วยังไม่มี users row → upsert ให้ (create-on-first-sight เหมือนที่อื่นในบอท)
//
// ⚠️ OTP state (otp_quota / otp_verify_<guildId>) **ไม่อยู่ที่นี่** — อยู่ db/otpSession.js
//    เพราะตอนยืนยันตัวตน users row อาจยังไม่เกิด จึงต้อง key ด้วย discord_id ต่อไป
const pool = require('./index');
const { userIdByDiscord, upsertUserByDiscord } = require('./org');

async function setUserSetting(discordId, key, value) {
    const userId = await upsertUserByDiscord(discordId);
    if (!userId) return;
    const sql = `INSERT INTO user_config (user_id, "key", value)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, "key") DO UPDATE SET
                   value = EXCLUDED.value,
                   updated_at = CURRENT_TIMESTAMP`;
    await pool.query(sql, [userId, key, JSON.stringify(value)]);
}

async function getUserSetting(discordId, key) {
    const userId = await userIdByDiscord(discordId);
    if (!userId) return null;
    const { rows } = await pool.query(
        'SELECT value FROM user_config WHERE user_id = $1 AND "key" = $2',
        [userId, key]
    );
    return rows[0]?.value ?? null;
}

async function deleteUserSetting(discordId, key) {
    const userId = await userIdByDiscord(discordId);
    if (!userId) return true;
    await pool.query(
        'DELETE FROM user_config WHERE user_id = $1 AND "key" = $2',
        [userId, key]
    );
    return true;
}

module.exports = {
    getUserSetting,
    setUserSetting,
    deleteUserSetting,
};
