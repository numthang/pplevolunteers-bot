// db/newsWatch.js — จำว่าข่าวชิ้นไหนเคยเห็นแล้ว
// ถ้าไม่จำ digest รอบ 17:00 จะซ้ำกับรอบ 8:00 ทั้งหมด → ประเมินไม่ได้ว่าของมีประโยชน์จริงไหม
const pool = require('./index');

// ⚠️ ทุกฟังก์ชันคีย์ด้วย (guildId, channelId) — 1 guild มีได้หลาย feed คนละห้องคนละคำค้น
//    ถ้าคีย์แค่ guildId ห้องที่สองจะไม่เห็นข่าวที่ห้องแรกส่งไปแล้ว ทั้งที่คนละกลุ่มผู้อ่าน

/** คืน Set ของ item_key ที่ห้องนี้เคยเห็นแล้ว */
async function getSeenKeys(guildId, channelId, keys) {
    if (!keys.length) return new Set();
    const { rows } = await pool.query(
        `SELECT item_key FROM news_watch_seen
          WHERE guild_id = $1 AND channel_id = $2 AND item_key = ANY($3::text[])`,
        [guildId, channelId, keys]
    );
    return new Set(rows.map(r => r.item_key));
}

/** บันทึกว่าเห็นแล้ว — รวมข่าวที่ถูกกรองทิ้งด้วย ไม่งั้นรอบหน้ามันจะกลับมาใหม่ */
async function markSeen(guildId, channelId, items) {
    if (!items.length) return;
    await pool.query(
        `INSERT INTO news_watch_seen (guild_id, channel_id, item_key, title)
         SELECT $1, $2, k, t FROM unnest($3::text[], $4::text[]) AS x(k, t)
         ON CONFLICT (guild_id, channel_id, item_key) DO NOTHING`,
        [guildId, channelId, items.map(i => i.key), items.map(i => (i.title || '').slice(0, 500))]
    );
}

/** ห้องนี้เคยรันแล้วหรือยัง — ใช้ตัดสินว่าเป็น "รอบแรก" ที่ต้องจำกัดจำนวนข่าว */
async function hasSeenAny(guildId, channelId) {
    const { rows } = await pool.query(
        'SELECT 1 FROM news_watch_seen WHERE guild_id = $1 AND channel_id = $2 LIMIT 1',
        [guildId, channelId]
    );
    return rows.length > 0;
}

/** ลบของเก่ากว่า N วัน — ตารางนี้โตวันละ ~100 แถวต่อ guild ถ้าไม่กวาดจะบวมเปล่าๆ */
async function pruneSeen(days = 30) {
    const { rowCount } = await pool.query(
        `DELETE FROM news_watch_seen WHERE seen_at < now() - ($1 || ' days')::interval`,
        [String(days)]
    );
    return rowCount;
}

module.exports = { getSeenKeys, markSeen, hasSeenAny, pruneSeen };
