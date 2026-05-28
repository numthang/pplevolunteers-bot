const pool = require('./index');

async function addImages(guildId, channelId, addedBy, images, messageId) {
  for (const img of images) {
    await pool.query(
      `INSERT INTO dc_media_baskets (guild_id, channel_id, added_by, type, image_url, message_id)
       VALUES ($1, $2, $3, 'image', $4, $5)`,
      [guildId, channelId, addedBy, img.url, messageId]
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

async function getBasket(guildId, channelId) {
  const { rows } = await pool.query(
    `SELECT * FROM dc_media_baskets WHERE guild_id = $1 AND channel_id = $2 ORDER BY added_at ASC`,
    [guildId, channelId]
  );
  return rows;
}

async function clearBasket(guildId, channelId) {
  await pool.query(
    `DELETE FROM dc_media_baskets WHERE guild_id = $1 AND channel_id = $2`,
    [guildId, channelId]
  );
}

async function addHistory(guildId, channelId, postedBy, { platform, imageCount, wmType, caption, scheduleTime, fbUrl, igUrl, threadsUrl, xUrl, status }) {
  await pool.query(
    `INSERT INTO dc_basket_history (guild_id, channel_id, posted_by, platform, image_count, wm_type, caption, schedule_time, fb_url, ig_url, threads_url, x_url, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [guildId, channelId, postedBy, platform, imageCount, wmType || null, caption || null, scheduleTime || null, fbUrl || null, igUrl || null, threadsUrl || null, xUrl || null, status]
  );
}

async function getHistory(guildId, channelId) {
  const { rows } = await pool.query(
    `SELECT * FROM dc_basket_history WHERE guild_id = $1 AND channel_id = $2 ORDER BY created_at DESC`,
    [guildId, channelId]
  );
  return rows;
}

module.exports = { addImages, setCaption, getBasket, clearBasket, addHistory, getHistory };
