const pool = require('./index');

async function addImages(guildId, channelId, addedBy, images, messageId) {
  // ต่อท้ายเสมอ — รูปใหม่ได้ sort_order = max+1 จะได้ไม่กระโดดไปหน้าสุดถ้าเคยเรียงไว้
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM dc_media_baskets
     WHERE guild_id = $1 AND channel_id = $2 AND type = 'image'`,
    [guildId, channelId]
  );
  let next = Number(rows[0].m);
  for (const img of images) {
    next += 1;
    await pool.query(
      `INSERT INTO dc_media_baskets (guild_id, channel_id, added_by, type, image_url, message_id, sort_order)
       VALUES ($1, $2, $3, 'image', $4, $5, $6)`,
      [guildId, channelId, addedBy, img.url, messageId, next]
    );
  }
}

async function addVideo(guildId, channelId, addedBy, videos, messageId) {
  for (const vid of videos) {
    await pool.query(
      `INSERT INTO dc_media_baskets (guild_id, channel_id, added_by, type, image_url, message_id)
       VALUES ($1, $2, $3, 'video', $4, $5)`,
      [guildId, channelId, addedBy, vid.url, messageId]
    );
  }
}

async function setCaption(guildId, channelId, addedBy, caption, messageId) {
  await pool.query(
    `DELETE FROM dc_media_baskets WHERE guild_id = $1 AND channel_id = $2 AND type = 'caption'`,
    [guildId, channelId]
  );
  await pool.query(
    `INSERT INTO dc_media_baskets (guild_id, channel_id, added_by, type, caption, message_id)
     VALUES ($1, $2, $3, 'caption', $4, $5)`,
    [guildId, channelId, addedBy, caption, messageId]
  );
}

// ต่อท้าย caption เดิม (ไม่มี → สร้างใหม่) — ใช้ตอนสะสมข้อความหลายอันก่อนให้ AI เรียบเรียง
async function appendCaption(guildId, channelId, addedBy, text, messageId) {
  const { rows } = await pool.query(
    `SELECT caption FROM dc_media_baskets WHERE guild_id = $1 AND channel_id = $2 AND type = 'caption' LIMIT 1`,
    [guildId, channelId]
  );
  const prev = rows[0]?.caption?.trim();
  const merged = prev ? `${prev}\n\n${text}` : text;
  await setCaption(guildId, channelId, addedBy, merged, messageId);
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

async function addHistory(guildId, channelId, postedBy, { platform, imageCount, videoCount, wmType, caption, scheduleTime, fbUrl, igUrl, threadsUrl, xUrl, status, groupName }) {
  await pool.query(
    `INSERT INTO dc_media_history (guild_id, channel_id, posted_by, platform, image_count, video_count, wm_type, caption, schedule_time, fb_url, ig_url, threads_url, x_url, status, group_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [guildId, channelId, postedBy, platform, imageCount, videoCount || 0, wmType || null, caption || null, scheduleTime || null, fbUrl || null, igUrl || null, threadsUrl || null, xUrl || null, status, groupName || null]
  );
}

async function getHistory(guildId, channelId) {
  const { rows } = await pool.query(
    `SELECT * FROM dc_media_history WHERE guild_id = $1 AND channel_id = $2 ORDER BY created_at DESC`,
    [guildId, channelId]
  );
  return rows;
}

module.exports = { addImages, addVideo, setCaption, appendCaption, getBasket, reorderImages, clearBasket, clearBasketMedia, addHistory, getHistory };
