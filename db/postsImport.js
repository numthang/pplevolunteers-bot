// db/postsImport.js — นำเข้ากระทู้ Discord เป็นโพสต์เดี่ยว (ไม่ใช่ตะกร้า)
//
// ต่างจาก db/mediaBasket.js ตรงที่ไม่ผ่าน ensureOpenEpisode
//
// ⭐ `channelId` ปกติเป็น NULL (context menu "นำเข้าเป็นโพสต์" ในดิสฯ) — คนกดอาจกดซ้ำในกระทู้เดิม
//    ตั้งใจให้ได้โพสต์ใหม่ทุกครั้ง ไม่ไปยึดสล็อต "ตะกร้าที่เปิดอยู่" ของห้องนั้น
//
// ⚠️ **ตัวกวาด backfill ส่ง channelId = id ของกระทู้มาด้วย** (scripts/data/backfillPostThreads.js)
//    เพราะต้องการสิ่งที่ตรงข้ามกันพอดี: กันซ้ำ 1 กระทู้ = 1 โพสต์ ตามหลักที่ user เคาะ
//    (1 topic = 1 posts = 1 ตะกร้าสื่อ) · partial unique `uq_open_basket_per_channel` บังคับให้เอง
//    และตะกร้าที่เปิดทีหลังในกระทู้เดียวกันจะ**เกาะใบเดิม** เพราะ ensureOpenEpisode หาเจอแล้วใช้ซ้ำ
// mirror ของ web/db/posts/episodes.js: createPost() ฝั่งบอท — ต้องเขียน post_episodes + post_revisions
// (ต้นฉบับดิบ + ฉบับ AI) ในทรานแซกชันเดียวกัน กันโพสต์กำพร้าไม่มีประวัติถ้า insert รอบสองล้ม
const pool = require('./index');
const { orgIdOfGuild, userIdByDiscord } = require('./org');
const { mirrorEntityCardFromBot } = require('./kanbanCards');

/**
 * สร้างโพสต์เดี่ยวจากกระทู้ + revision แรก (ต้นฉบับดิบ) + revision สอง (ฉบับ AI)
 *
 * @param {'ai'|'backfill'} createdVia
 *        `ai` = คนกด context menu ในดิสฯ เดี๋ยวนั้น → เป็น**งานปัจจุบัน** โผล่ในฟีดหลักตามปกติ
 *        `backfill` = สคริปต์กวาดกระทู้เก่าย้อนหลัง → **ซ่อนจากฟีดหลัก** (listPosts ตัดออก default)
 *        แยกเพราะ `channel_id` มีเหมือนกันทั้งคู่ บอกไม่ได้ว่าอันไหนงานที่ยังต้องทำ
 * @returns {object} แถวเต็มของ post_episodes ที่สร้าง (id ใช้ต่อกับ attachImages)
 */
async function createImportedPost({ guildId, addedByDiscordId, category = null, title, body, sourceIdea, channelId = null, channelName = null, createdVia = 'ai' }) {
  const orgId = await orgIdOfGuild(guildId);
  const ownerUserId = await userIdByDiscord(addedByDiscordId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO post_episodes
         (org_id, owner_user_id, visibility, category, title, body, source_idea, created_via, status, guild_id, channel_id, channel_name, last_edited_by)
       VALUES ($1, $2, 'org', $3, $4, $5, $6, $10, 'draft', $7, $8, $9, $2)
       RETURNING *`,
      [orgId, ownerUserId, category, title, body, sourceIdea, guildId, channelId, channelName, createdVia]
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

    // ⭐ งานสื่อทุกใบต้องมีการ์ดใน kanban — คู่กับ hook ฝั่งเว็บใน web/db/posts/episodes.js
    //    ที่นี่สร้าง visibility='org' เสมอ จึงไม่ต้องเช็ค (ฝั่งเว็บมีร่าง personal ด้วยแต่ก็สร้างการ์ดแล้ว
    //    ตั้งแต่ 2026-08-24 รอบสอง — เจ้าของเห็นคนเดียว)
    //    fire-and-forget หลัง COMMIT — kanban พังต้องไม่ทำให้ import กระทู้ไม่ได้
    //    ⛔ ห้ามย้ายเข้าไปในทรานแซกชัน: มันใช้ pool คนละ connection จะรอ commit ที่ยังไม่เกิด = ค้าง
    //    ⭐ ของ backfill = งานเก่าที่จบไปแล้ว → การ์ดลงกอง "เสร็จแล้ว" ตั้งแต่สร้าง
    //       (ได้ผลจริงเพราะโพสต์เป็น draft → POST_STATUS คืน NULL → ใช้ค่านี้)
    mirrorEntityCardFromBot(orgId, 'post', {
      id: post.id, title: post.title, ownerUserId,
    }, {
      createdBy: ownerUserId, guildId,
      statusType: createdVia === 'backfill' ? 'done' : null,
    }).catch(() => {});

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
