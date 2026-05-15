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

module.exports = { addImages, setCaption, getBasket, clearBasket };
