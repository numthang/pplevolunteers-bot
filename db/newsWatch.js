// db/newsWatch.js — จำว่าข่าวชิ้นไหนเคยเห็นแล้ว
// ถ้าไม่จำ digest รอบ 17:00 จะซ้ำกับรอบ 8:00 ทั้งหมด → ประเมินไม่ได้ว่าของมีประโยชน์จริงไหม
const pool = require('./index');

/** คืน Set ของ item_key ที่เคยเห็นแล้ว (ของ guild นี้) */
async function getSeenKeys(guildId, keys) {
    if (!keys.length) return new Set();
    const { rows } = await pool.query(
        'SELECT item_key FROM news_watch_seen WHERE guild_id = $1 AND item_key = ANY($2::text[])',
        [guildId, keys]
    );
    return new Set(rows.map(r => r.item_key));
}

/** บันทึกว่าเห็นแล้ว — รวมข่าวที่ถูกกรองทิ้งด้วย ไม่งั้นรอบหน้ามันจะกลับมาใหม่ */
async function markSeen(guildId, items) {
    if (!items.length) return;
    await pool.query(
        `INSERT INTO news_watch_seen (guild_id, item_key, title)
         SELECT $1, k, t FROM unnest($2::text[], $3::text[]) AS x(k, t)
         ON CONFLICT (guild_id, item_key) DO NOTHING`,
        [guildId, items.map(i => i.key), items.map(i => (i.title || '').slice(0, 500))]
    );
}

/** guild นี้เคยรันแล้วหรือยัง — ใช้ตัดสินว่าเป็น "รอบแรก" ที่ต้องจำกัดจำนวนข่าว */
async function hasSeenAny(guildId) {
    const { rows } = await pool.query(
        'SELECT 1 FROM news_watch_seen WHERE guild_id = $1 LIMIT 1',
        [guildId]
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
