const pool = require('./index');

async function addImages(guildId, channelId, addedBy, images, messageId, channelName = null) {
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM dc_media_baskets
     WHERE guild_id = $1 AND channel_id = $2 AND type = 'image'`,
    [guildId, channelId]
  );
  let next = Number(rows[0].m);
  for (const img of images) {
    next += 1;
    await pool.query(
      `INSERT INTO dc_media_baskets (guild_id, channel_id, added_by, type, image_url, message_id, sort_order, channel_name)
       VALUES ($1, $2, $3, 'image', $4, $5, $6, $7)`,
      [guildId, channelId, addedBy, img.url, messageId, next, channelName]
    );
  }
}

async function addVideo(guildId, channelId, addedBy, videos, messageId, channelName = null) {
  for (const vid of videos) {
    await pool.query(
      `INSERT INTO dc_media_baskets (guild_id, channel_id, added_by, type, image_url, message_id, channel_name)
       VALUES ($1, $2, $3, 'video', $4, $5, $6)`,
      [guildId, channelId, addedBy, vid.url, messageId, channelName]
    );
  }
}

async function setCaption(guildId, channelId, addedBy, caption, messageId, channelName = null) {
  await pool.query(
    `DELETE FROM dc_media_baskets WHERE guild_id = $1 AND channel_id = $2 AND type = 'caption'`,
    [guildId, channelId]
  );
  await pool.query(
    `INSERT INTO dc_media_baskets (guild_id, channel_id, added_by, type, caption, message_id, channel_name)
     VALUES ($1, $2, $3, 'caption', $4, $5, $6)`,
    [guildId, channelId, addedBy, caption, messageId, channelName]
  );
}

// ต่อท้าย caption เดิม (ไม่มี → สร้างใหม่) — ใช้ตอนสะสมข้อความหลายอันก่อนให้ AI เรียบเรียง
async function appendCaption(guildId, channelId, addedBy, text, messageId, channelName = null) {
  const { rows } = await pool.query(
    `SELECT caption FROM dc_media_baskets WHERE guild_id = $1 AND channel_id = $2 AND type = 'caption' LIMIT 1`,
    [guildId, channelId]
  );
  const prev = rows[0]?.caption?.trim();
  const merged = prev ? `${prev}\n\n${text}` : text;
  await setCaption(guildId, channelId, addedBy, merged, messageId, channelName);
}

async function getBasket(guildId, channelId) {
  const { rows } = await pool.query(
    `SELECT * FROM dc_media_baskets WHERE guild_id = $1 AND channel_id = $2
     ORDER BY sort_order ASC, added_at ASC`,
    [guildId, channelId]
  );
  return rows;
}

// เรียงลำดับรูปใหม่ — orderedIds = array ของ id เรียงตามลำดับที่ต้องการ
// scope ด้วย guild+channel กัน reorder ข้ามห้อง/ข้าม guild
async function reorderImages(guildId, channelId, orderedIds) {
  for (let i = 0; i < orderedIds.length; i++) {
    await pool.query(
      `UPDATE dc_media_baskets SET sort_order = $1
       WHERE id = $2 AND guild_id = $3 AND channel_id = $4 AND type = 'image'`,
      [i + 1, orderedIds[i], guildId, channelId]
    );
  }
}

async function clearBasket(guildId, channelId) {
  await pool.query(
    `DELETE FROM dc_media_baskets WHERE guild_id = $1 AND channel_id = $2`,
    [guildId, channelId]
  );
}

// ล้างเฉพาะ media (รูป/วิดีโอ) — เก็บ caption ไว้ ใช้ตอนสลับชนิด media
async function clearBasketMedia(guildId, channelId) {
  await pool.query(
    `DELETE FROM dc_media_baskets WHERE guild_id = $1 AND channel_id = $2 AND type IN ('image', 'video')`,
    [guildId, channelId]
  );
}

// ประวัติการโพสต์ย้ายไป post_social_history แล้ว (ก้อน 4 ขั้น 3, 2026-07-29)
// - เขียน: services/publishPipeline.js เป็นคนเขียน (addHistory เดิมถูกลบ — และมันพังเงียบมาตั้งแต่ มิ.ย.
//   เพราะ INSERT ใส่คอลัมน์ group_name ที่ไม่มีอยู่จริง แล้ว .catch(()=>{}) กลืน error)
// - อ่าน: ที่นี่ · 1 แถว = 1 แพลตฟอร์ม → **GROUP BY batch_id** ให้กลับเป็น "1 บรรทัด = 1 ครั้งที่โพสต์"
async function getHistory(guildId, channelId, limit = 20) {
  const { rows } = await pool.query(
    `SELECT h.batch_id,
            MIN(h.created_at) AS created_at,
            MAX(h.group_name) AS group_name,
            MAX((SELECT COUNT(*)::int FROM jsonb_array_elements(h.media) e WHERE e->>'kind' = 'image')) AS image_count,
            MAX((SELECT COUNT(*)::int FROM jsonb_array_elements(h.media) e WHERE e->>'kind' = 'video')) AS video_count,
            jsonb_agg(jsonb_build_object('platform', h.platform, 'url', h.result->>'url', 'status', h.status)
                      ORDER BY h.id) AS platforms
       FROM post_social_history h
      WHERE h.guild_id = $1 AND h.channel_id = $2
      GROUP BY h.batch_id
      ORDER BY MIN(h.created_at) DESC
      LIMIT $3`,
    [guildId, channelId, limit]
  );
  return rows;
}

module.exports = { addImages, addVideo, setCaption, appendCaption, getBasket, reorderImages, clearBasket, clearBasketMedia, getHistory };
