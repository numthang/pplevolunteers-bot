// one-off: เติม channel_name ให้ตะกร้าเก่าที่ยังเป็น null (ดึงจาก Discord)
require('dotenv').config();
const pool = require('../../db/index');

async function fetchChannelName(channelId) {
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d.name || null;
  } catch { return null; }
}

(async () => {
  const { rows } = await pool.query(
    `SELECT DISTINCT guild_id, channel_id FROM dc_media_baskets WHERE channel_name IS NULL`
  );
  console.log(`Found ${rows.length} channels without name, backfilling...`);
  let ok = 0, fail = 0;
  for (let i = 0; i < rows.length; i++) {
    const { guild_id, channel_id } = rows[i];
    const name = await fetchChannelName(channel_id);
    if (name) {
      await pool.query(
        `UPDATE dc_media_baskets SET channel_name = $1 WHERE guild_id = $2 AND channel_id = $3`,
        [name, guild_id, channel_id]
      );
      ok++;
    } else fail++;
    process.stdout.write(`\r  ${i + 1}/${rows.length} (${ok} ok, ${fail} fail)`);
  }
  console.log(`\nDone: ${ok} updated, ${fail} failed`);
  await pool.end();
})();
