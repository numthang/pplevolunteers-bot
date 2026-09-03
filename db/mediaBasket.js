// db/mediaBasket.js — ตะกร้าสื่อของ Discord
//
// ⚠️ ก้อน 4c (2026-07-30): **ตะกร้าไม่ใช่ตารางของตัวเองแล้ว** — ยุบเข้า post_episodes/post_episode_media
//    "ตะกร้าที่เปิดอยู่ของห้อง" = แถวใน post_episodes ที่ `channel_id = ห้องนั้น AND archived_at IS NULL`
//    (partial unique index `uq_open_basket_per_channel` บังคับให้เหลือใบเดียวที่ DB ไม่ใช่ที่โค้ด)
//    ⛔ ห้ามสร้างตาราง slot มาคั่น — เคาะแล้ว 2026-07-30 (md/posts/PLAN-4.md)
//
// ไฟล์นี้เป็น **ตะเข็บ**: ข้างในเป็น post_* แต่ข้างนอกยังคืนรูปแบบแถวเดิม
//   { id, type: 'image'|'video'|'caption', image_url, caption, message_id, sort_order, path }
// เพื่อให้ handlers/basketHandler.js · basketAiHandler.js · aiThreadHandler.js ไม่ต้องรื้อ
//
// - caption ของตะกร้า = `post_episodes.body`  (ไม่ใช่ "แถวชนิดหนึ่ง" อีกแล้ว)
// - รูป/วิดีโอ = `post_episode_media` · โหลดไฟล์ลงดิสก์ตอนหย่อน (background) แล้วเติม `path`
//   `source_url` = ลิงก์ Discord เดิม — ใช้เป็น fallback ระหว่างไฟล์ยังโหลดไม่เสร็จ + ทางกลับถ้าไฟล์หาย
// - ล้างตะกร้า = **archive โพสต์** ไม่ใช่ลบแถว (มันคือคอนเทนต์ · ยังรู้ว่ามาจากห้องไหน)
const pool = require('./index');
const storage = require('../utils/postsStorage');
const { mirrorEntityCardFromBot } = require('./kanbanCards');

/**
 * ชื่อเรื่องจาก **บรรทัดแรก**ของแคปชัน — ตะกร้าดิสฯ ไม่มีช่องกรอกชื่อ (หย่อนข้อความอย่างเดียว)
 * ไม่มีตัวนี้ โพสต์จากดิสฯ จะขึ้น "ไม่มีชื่อ" ทุกใบในหน้า /posts หาไม่เจอว่าใบไหนเป็นใบไหน
 *
 * ⚠️ ชื่อเรื่องเป็น**ป้ายในระบบเท่านั้น ไม่ถูกโพสต์ออกโซเชียล** — ตัวที่โพสต์คือ `body`
 *    (`web/app/api/posts/[id]/publish/route.js` ส่ง `caption: post.body`) จึงไม่ซ้ำซ้อนกับเนื้อหา
 */
function firstLineTitle(text) {
  const line = String(text || '')
    .split('\n')
    .map(s => s.trim())
    .find(Boolean);
  if (!line) return null;
  const clean = line
    // token ของ Discord — <@123> <@&123> <#123> <:emoji:123> อ่านไม่รู้เรื่องถ้าเอามาเป็นชื่อ
    .replace(/<a?:(\w+):\d+>/g, '')
    .replace(/<[@#][&!]?\d+>/g, '')
    .replace(/^[#>*\-–—•═=─_~\s]+/, '')   // หัวข้อ markdown / bullet / เส้นคั่นตกแต่ง
    .replace(/[═=─_]{3,}\s*$/, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return null;
  return clean.length > 120 ? `${clean.slice(0, 119)}…` : clean;
}

/** users.id ของคนหย่อน — ไม่มีแถวใน users ก็หย่อนได้ (ตะกร้าดิสฯ ไม่บังคับ login) */
async function userIdOf(discordId) {
  if (!discordId) return null;
  const { rows } = await pool.query('SELECT id FROM users WHERE discord_id = $1', [String(discordId)]);
  return rows[0]?.id ?? null;
}

/**
 * ตะกร้าที่เปิดอยู่ของห้อง — ไม่มีก็เปิดใบใหม่
 * channel_name = ชื่อห้องต้นทาง · **ห้ามเขียนลง `category`** (เคยทำ แล้วพัง 2026-07-30)
 *   `category` = หมวดที่คนตั้งเอง ปล่อยว่างไว้ให้เขาจัด — ยัดชื่อห้องลงไปแล้วเขาเปลี่ยนหมวด
 *   ชื่อห้องหายถาวร และตัวกรองหมวดต้องคอย exclude ชื่อห้องทุก query
 * org_id NULL = guild ที่ยังไม่ผูก org → โผล่แค่ในดิสฯ ไม่เข้าฟีดองค์กร
 */
async function ensureOpenEpisode(guildId, channelId, addedBy = null, channelName = null) {
  const found = await getOpenEpisode(guildId, channelId);
  if (found) {
    // ห้องเปลี่ยนชื่อ / ตะกร้าเก่าที่ยังไม่มีชื่อห้อง → เติมให้ครั้งเดียว
    if (channelName && !found.channel_name) {
      await pool.query('UPDATE post_episodes SET channel_name = $2 WHERE id = $1', [found.id, channelName]);
    }
    return found.id;
  }

  const ownerUserId = await userIdOf(addedBy);
  const { rows } = await pool.query(
    `INSERT INTO post_episodes (org_id, owner_user_id, visibility, channel_name, created_via, status, guild_id, channel_id)
     SELECT g.org_id, $3, 'org', $4, 'manual', 'draft', $1, $2
       FROM (SELECT $1::varchar AS gid) x
       LEFT JOIN dc_guilds g ON g.guild_id = x.gid
     ON CONFLICT DO NOTHING
     RETURNING id, org_id`,
    [guildId, channelId, ownerUserId, channelName || null]
  );
  if (rows[0]) {
    // ⭐ งานสื่อทุกใบต้องมีการ์ดใน kanban — ตะกร้าคือทางที่ใช้บ่อยที่สุดของงานสื่อฝั่งบอท
    //    fire-and-forget: kanban พังต้องไม่ทำให้เปิดตะกร้าไม่ได้ · ตาข่ายคือ reconcileEntityCards()
    //    ⚠️ ตะกร้าเพิ่งเปิดยังไม่มีชื่อเรื่อง → การ์ดใช้ชื่อห้องไปก่อน แล้วอ่านสดจากต้นทางทีหลังเอง
    //       (การ์ดที่ผูกของจริงอ่าน title สดเสมอ ชื่อที่เก็บในการ์ดเป็นแค่ค่าสำรอง)
    //    org_id มาจาก RETURNING ไม่ยิง query เพิ่ม · เป็น null ได้ถ้า guild ยังไม่ผูก org
    //    (LEFT JOIN dc_guilds ข้างบน) → ไม่มี org ก็ไม่มีกระดานให้ลง ข้ามไปเลย
    if (rows[0].org_id) {
      mirrorEntityCardFromBot(rows[0].org_id, 'post', {
        // ⚠️ เฟส C จะเลิกก็อปคนสร้างลงเป็นผู้รับผิดชอบ (ดู postsImport.js ที่เดียวกัน)
        id: rows[0].id, title: channelName || null, assigneeIds: ownerUserId ? [ownerUserId] : [],
      }, { createdBy: ownerUserId, guildId }).catch(() => {});
    }
    return rows[0].id;
  }

  // ชนกับคนอื่นที่เพิ่งเปิดตะกร้าห้องเดียวกัน (unique index กันไว้) → ใช้ใบของเขา
  const again = await getOpenEpisode(guildId, channelId);
  if (!again) throw new Error('เปิดตะกร้าไม่สำเร็จ');
  return again.id;
}

async function getOpenEpisode(guildId, channelId) {
  const { rows } = await pool.query(
    `SELECT id, org_id, channel_name, body FROM post_episodes
      WHERE channel_id = $2 AND guild_id = $1 AND archived_at IS NULL
      LIMIT 1`,
    [guildId, channelId]
  );
  return rows[0] || null;
}

/** แถวสื่อที่ยังไม่มีไฟล์บนดิสก์ — ตัวโหลด background หยิบจากที่นี่ */
async function pendingDownloads(episodeId) {
  const { rows } = await pool.query(
    `SELECT id, source_url FROM post_episode_media
      WHERE episode_id = $1 AND path IS NULL AND source_url IS NOT NULL
      ORDER BY id`,
    [episodeId]
  );
  return rows;
}

async function setMediaPath(id, path) {
  await pool.query('UPDATE post_episode_media SET path = $2 WHERE id = $1', [id, path]);
}

/**
 * โหลดไฟล์ที่ค้างลงดิสก์ — **เรียกแบบ fire-and-forget หลัง ack เสมอ** (ห้ามให้ interaction รอไฟล์)
 * ปิดบั๊กรูปตายใน 24 ชม. + ทำให้ตะกร้าไม่พึ่ง Discord CDN เลยทั้งรูปและวิดีโอ
 * @param {function} [refreshUrls] async (urls[]) => Map — รีเฟรชลิงก์ที่หมดอายุก่อนโหลด (ตะกร้าเก่า)
 */
async function downloadPending(episodeId, { refreshUrls = null } = {}) {
  const rows = await pendingDownloads(episodeId);
  if (!rows.length) return 0;

  let fresh = new Map();
  if (refreshUrls) {
    try { fresh = await refreshUrls(rows.map(r => r.source_url)); } catch { /* ใช้ลิงก์เดิมต่อ */ }
  }

  let done = 0;
  for (const r of rows) {
    try {
      const path = await storage.downloadToDisk(fresh.get(r.source_url) || r.source_url);
      await setMediaPath(r.id, path);
      done++;
    } catch (err) {
      // ล้มก็ไม่เป็นไร — แถวยังมี source_url ใช้โพสต์ได้ และรอบหน้าที่หย่อนจะลองใหม่ให้เอง
      console.error(`[basket] โหลดสื่อ #${r.id} ลงดิสก์ไม่สำเร็จ:`, err.message);
    }
  }
  if (done) console.log(`[basket] โหลดสื่อลงดิสก์ ${done}/${rows.length} ไฟล์ (ตอน #${episodeId})`);
  return done;
}

async function addImages(guildId, channelId, addedBy, images, messageId, channelName = null) {
  const episodeId = await ensureOpenEpisode(guildId, channelId, addedBy, channelName);
  const userId = await userIdOf(addedBy);
  for (const img of images) {
    await pool.query(
      `INSERT INTO post_episode_media (episode_id, kind, path, sort_order, source_url, source_message_id, added_by)
       SELECT $1, 'upload', NULL, COALESCE(MAX(sort_order), -1) + 1, $2, $3, $4
         FROM post_episode_media WHERE episode_id = $1`,
      [episodeId, img.url, messageId || null, userId]
    );
  }
  return episodeId;
}

async function addVideo(guildId, channelId, addedBy, videos, messageId, channelName = null) {
  const episodeId = await ensureOpenEpisode(guildId, channelId, addedBy, channelName);
  const userId = await userIdOf(addedBy);
  for (const vid of videos) {
    await pool.query(
      `INSERT INTO post_episode_media (episode_id, kind, path, sort_order, source_url, source_message_id, added_by)
       SELECT $1, 'video', NULL, COALESCE(MAX(sort_order), -1) + 1, $2, $3, $4
         FROM post_episode_media WHERE episode_id = $1`,
      [episodeId, vid.url, messageId || null, userId]
    );
  }
  return episodeId;
}

async function setCaption(guildId, channelId, addedBy, caption, messageId, channelName = null) {
  const episodeId = await ensureOpenEpisode(guildId, channelId, addedBy, channelName);

  // ชื่อเรื่อง = บรรทัดแรก **แต่ห้ามทับชื่อที่คนตั้งเองบนเว็บ**
  // ดูจาก: ชื่อปัจจุบันตรงกับบรรทัดแรกของ body เดิมไหม → ตรง = ของอัตโนมัติ (อัปเดตตามได้)
  //                                                    ไม่ตรง + ไม่ว่าง = คนตั้งเอง (ปล่อยไว้)
  const { rows } = await pool.query('SELECT body, title FROM post_episodes WHERE id = $1', [episodeId]);
  const curTitle = (rows[0]?.title || '').trim();
  const isManual = !!curTitle && curTitle !== firstLineTitle(rows[0]?.body);
  const nextTitle = isManual ? (rows[0]?.title ?? null) : firstLineTitle(caption);

  await pool.query(
    `UPDATE post_episodes
        SET body = $2, title = $4, last_edited_by = COALESCE($3, last_edited_by), updated_at = now()
      WHERE id = $1`,
    [episodeId, caption || null, await userIdOf(addedBy), nextTitle]
  );
  return episodeId;
}

// ต่อท้าย caption เดิม (ไม่มี → สร้างใหม่) — ใช้ตอนสะสมข้อความหลายอันก่อนให้ AI เรียบเรียง
async function appendCaption(guildId, channelId, addedBy, text, messageId, channelName = null) {
  const episodeId = await ensureOpenEpisode(guildId, channelId, addedBy, channelName);
  const { rows } = await pool.query('SELECT body FROM post_episodes WHERE id = $1', [episodeId]);
  const prev = rows[0]?.body?.trim();
  const merged = prev ? `${prev}\n\n${text}` : text;
  return setCaption(guildId, channelId, addedBy, merged, messageId, channelName);
}

/**
 * แถวของตะกร้าในรูปแบบเดิม — caption เป็นแถวสังเคราะห์จาก `post_episodes.body`
 * `path` = ไฟล์บนดิสก์ (NULL = ยังโหลดไม่เสร็จ ให้ใช้ `image_url` ไปก่อน)
 * การ์ดคำคมที่ทำบนเว็บ (kind='quote') นับเป็นรูปด้วย — ตะกร้ากับโพสต์เป็นของก้อนเดียวกันแล้ว
 */
async function getBasket(guildId, channelId) {
  const ep = await getOpenEpisode(guildId, channelId);
  if (!ep) return [];

  const { rows } = await pool.query(
    `SELECT id, kind, path, source_url, source_message_id, sort_order, created_at
       FROM post_episode_media
      WHERE episode_id = $1
      ORDER BY sort_order ASC, id ASC`,
    [ep.id]
  );

  const out = rows.map(r => ({
    id: r.id,
    episode_id: ep.id,
    type: r.kind === 'video' ? 'video' : 'image',
    image_url: r.source_url,
    path: r.path,
    caption: null,
    message_id: r.source_message_id,
    sort_order: r.sort_order,
    added_at: r.created_at,
  }));

  if (ep.body?.trim()) {
    out.push({ id: null, episode_id: ep.id, type: 'caption', image_url: null, path: null,
               caption: ep.body, message_id: null, sort_order: 0 });
  }
  return out;
}

// เรียงลำดับรูปใหม่ — orderedIds = array ของ id เรียงตามลำดับที่ต้องการ
// scope ด้วย guild+channel กัน reorder ข้ามห้อง/ข้าม guild
async function reorderImages(guildId, channelId, orderedIds) {
  const ep = await getOpenEpisode(guildId, channelId);
  if (!ep) return;
  for (let i = 0; i < orderedIds.length; i++) {
    await pool.query(
      `UPDATE post_episode_media SET sort_order = $1
        WHERE id = $2 AND episode_id = $3 AND kind <> 'video'`,
      [i, orderedIds[i], ep.id]
    );
  }
}

/** ล้างตะกร้า = **archive โพสต์** (ห้ามลบแถว — มันคือคอนเทนต์) → ห้องว่างพร้อมเปิดใบใหม่ */
async function clearBasket(guildId, channelId) {
  await pool.query(
    `UPDATE post_episodes SET archived_at = now(), updated_at = now()
      WHERE channel_id = $2 AND guild_id = $1 AND archived_at IS NULL`,
    [guildId, channelId]
  );
}

// ล้างเฉพาะ media (รูป/วิดีโอ) — เก็บ caption ไว้ ใช้ตอนสลับชนิด media
async function clearBasketMedia(guildId, channelId) {
  const ep = await getOpenEpisode(guildId, channelId);
  if (!ep) return;
  const { rows } = await pool.query(
    `DELETE FROM post_episode_media WHERE episode_id = $1 AND kind IN ('upload', 'video') RETURNING path`,
    [ep.id]
  );
  for (const r of rows) await storage.deleteFile(r.path);
}

/** ลบสื่อทีละชิ้น (หน้าเว็บตะกร้ากดลบรูป) — ลบไฟล์บนดิสก์ด้วย */
async function deleteBasketMedia(guildId, channelId, mediaId) {
  const ep = await getOpenEpisode(guildId, channelId);
  if (!ep) return false;
  const { rows } = await pool.query(
    `DELETE FROM post_episode_media WHERE id = $1 AND episode_id = $2 RETURNING path`,
    [mediaId, ep.id]
  );
  if (!rows[0]) return false;
  await storage.deleteFile(rows[0].path);
  return true;
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

module.exports = {
  addImages, addVideo, setCaption, appendCaption, getBasket, reorderImages,
  clearBasket, clearBasketMedia, deleteBasketMedia, getHistory,
  getOpenEpisode, ensureOpenEpisode, pendingDownloads, setMediaPath, downloadPending,
};
