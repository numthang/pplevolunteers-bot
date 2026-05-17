const pool = require('./index');

async function addImages(guildId, channelId, addedBy, images, messageId) {
  for (const img of images) {
    await pool.execute(
      `INSERT INTO dc_media_baskets (guild_id, channel_id, added_by, type, image_url, message_id)
       VALUES (?, ?, ?, 'image', ?, ?)`,
      [guildId, channelId, addedBy, img.url, messageId]
    );
  }
}

async function setCaption(guildId, channelId, addedBy, caption, messageId) {
  await pool.execute(
    `DELETE FROM dc_media_baskets WHERE guild_id = ? AND channel_id = ? AND type = 'caption'`,
    [guildId, channelId]
  );
  await pool.execute(
    `INSERT INTO dc_media_baskets (guild_id, channel_id, added_by, type, caption, message_id)
     VALUES (?, ?, ?, 'caption', ?, ?)`,
    [guildId, channelId, addedBy, caption, messageId]
  );
}

async function getBasket(guildId, channelId) {
  const [rows] = await pool.execute(
    `SELECT * FROM dc_media_baskets WHERE guild_id = ? AND channel_id = ? ORDER BY added_at ASC`,
    [guildId, channelId]
  );
  return rows;
}

async function clearBasket(guildId, channelId) {
  await pool.execute(
    `DELETE FROM dc_media_baskets WHERE guild_id = ? AND channel_id = ?`,
    [guildId, channelId]
  );
}

async function addHistory(guildId, channelId, postedBy, { platform, imageCount, wmType, caption, scheduleTime, fbUrl, igUrl, threadsUrl, status }) {
  await pool.execute(
    `INSERT INTO dc_basket_history (guild_id, channel_id, posted_by, platform, image_count, wm_type, caption, schedule_time, fb_url, ig_url, threads_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [guildId, channelId, postedBy, platform, imageCount, wmType || null, caption || null, scheduleTime || null, fbUrl || null, igUrl || null, threadsUrl || null, status]
  );
}

async function getHistory(guildId, channelId) {
  const [rows] = await pool.execute(
    `SELECT * FROM dc_basket_history WHERE guild_id = ? AND channel_id = ? ORDER BY created_at DESC`,
    [guildId, channelId]
  );
  return rows;
}

module.exports = { addImages, setCaption, getBasket, clearBasket, addHistory, getHistory };
