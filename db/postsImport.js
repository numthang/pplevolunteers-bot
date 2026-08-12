// db/postsImport.js — นำเข้ากระทู้ Discord เป็นโพสต์เดี่ยว (ไม่ใช่ตะกร้า)
//
// ต่างจาก db/mediaBasket.js ตรงที่ไม่ผ่าน ensureOpenEpisode — ไม่ผูกกับ channel_id เลย
// (channel_id ต้องเป็น NULL เสมอ ไม่งั้นจะชนกับ partial unique index ของตะกร้า `uq_open_basket_per_channel`
//  และกลายเป็น "ตะกร้าที่เปิดอยู่" ของห้องนั้นโดยไม่ได้ตั้งใจ)
// mirror ของ web/db/posts/episodes.js: createPost() ฝั่งบอท — ต้องเขียน post_episodes + post_revisions
// (ต้นฉบับดิบ + ฉบับ AI) ในทรานแซกชันเดียวกัน กันโพสต์กำพร้าไม่มีประวัติถ้า insert รอบสองล้ม
const pool = require('./index');
const { orgIdOfGuild, userIdByDiscord } = require('./org');

/**
 * สร้างโพสต์เดี่ยวจากกระทู้ + revision แรก (ต้นฉบับดิบ) + revision สอง (ฉบับ AI)
 * @returns {object} แถวเต็มของ post_episodes ที่สร้าง (id ใช้ต่อกับ attachImages)
 */
async function createImportedPost({ guildId, addedByDiscordId, category = null, title, body, sourceIdea }) {
  const orgId = await orgIdOfGuild(guildId);
  const ownerUserId = await userIdByDiscord(addedByDiscordId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO post_episodes
         (org_id, owner_user_id, visibility, category, title, body, source_idea, created_via, status, guild_id, channel_id, last_edited_by)
       VALUES ($1, $2, 'org', $3, $4, $5, $6, 'ai', 'draft', $7, NULL, $2)
       RETURNING *`,
      [orgId, ownerUserId, category, title, body, sourceIdea, guildId]
    );
    const post = rows[0];

    // ถอยเวลา 1 วินาที — ทั้ง 2 แถวอยู่ทรานแซกชันเดียวจึงได้ now() เท่ากันเป๊ะ ไม่งั้นแยกไม่ออกว่าอันไหนต้นฉบับ
    await client.query(
      `INSERT INTO post_revisions (episode_id, title, body, edited_by_user_id, created_at)
       VALUES ($1, NULL, $2, $3, now() - interval '1 second')`,
      [post.id, sourceIdea, ownerUserId]
    );
    await client.query(
      `INSERT INTO post_revisions (episode_id, title, body, edited_by_user_id) VALUES ($1, $2, $3, $4)`,
      [post.id, title, body, ownerUserId]
    );

    await client.query('COMMIT');
    return post;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * แนบรูปจากกระทู้เข้า episode ที่มีอยู่แล้ว — ต่างจาก mediaBasket.addImages() ตรงที่รับ messageId **ต่อรูป**
 * (ตะกร้าหย่อนรูปทีละ 1 ข้อความ แต่ import กระทู้ดึงรูปจากหลายข้อความพร้อมกัน)
 * @param {Array<{url: string, messageId: string|null}>} images
 */
async function attachImages(episodeId, addedByDiscordId, images) {
  const userId = await userIdByDiscord(addedByDiscordId);
  for (const img of images) {
    await pool.query(
      `INSERT INTO post_episode_media (episode_id, kind, path, sort_order, source_url, source_message_id, added_by)
       SELECT $1, 'upload', NULL, COALESCE(MAX(sort_order), -1) + 1, $2, $3, $4
         FROM post_episode_media WHERE episode_id = $1`,
      [episodeId, img.url, img.messageId || null, userId]
    );
  }
}

module.exports = { createImportedPost, attachImages };
