const pool = require('./index');

// ─── dc_forum_config ────────────────────────────────────────────────────────

async function getForumConfig(guildId, channelId) {
  const { rows } = await pool.query(
    'SELECT * FROM dc_forum_config WHERE guild_id = $1 AND channel_id = $2',
    [guildId, channelId]
  );
  return rows[0] ?? null;
}

async function getAllForumConfigs(guildId) {
  const { rows } = await pool.query(
    'SELECT * FROM dc_forum_config WHERE guild_id = $1',
    [guildId]
  );
  return rows;
}

async function upsertForumConfig(guildId, channelId, { dashboardMsgId, itemsPerPage } = {}) {
  await pool.query(
    `INSERT INTO dc_forum_config (guild_id, channel_id, dashboard_msg_id, items_per_page)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (guild_id, channel_id) DO UPDATE SET
       dashboard_msg_id = COALESCE(EXCLUDED.dashboard_msg_id, dc_forum_config.dashboard_msg_id),
       items_per_page   = COALESCE(EXCLUDED.items_per_page,   dc_forum_config.items_per_page)`,
    [guildId, channelId, dashboardMsgId ?? null, itemsPerPage ?? 10]
  );
}

async function setDashboardMsgId(guildId, channelId, msgId) {
  await pool.query(
    'UPDATE dc_forum_config SET dashboard_msg_id = $1 WHERE guild_id = $2 AND channel_id = $3',
    [msgId, guildId, channelId]
  );
}

// ─── dc_forum_posts ─────────────────────────────────────────────────────────

async function upsertForumPost(guildId, channelId, { postId, postName, postUrl, authorId, createdAt }) {
  await pool.query(
    `INSERT INTO dc_forum_posts (guild_id, channel_id, post_id, post_name, post_url, author_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (post_id) DO UPDATE SET
       post_name  = EXCLUDED.post_name,
       post_url   = EXCLUDED.post_url,
       indexed_at = CURRENT_TIMESTAMP`,
    [guildId, channelId, postId, postName, postUrl, authorId ?? null, createdAt]
  );
}

// ค้น post_name ด้วย LIKE
async function searchPostsByName(guildId, keyword, channelId = null) {
  const params = [`%${keyword}%`, guildId];
  let sql = `SELECT post_id, post_name, post_url, channel_id, created_at
             FROM dc_forum_posts
             WHERE post_name LIKE $1 AND guild_id = $2`;
  if (channelId) {
    params.push(channelId);
    sql += ` AND channel_id = $${params.length}`;
  }
  sql += ' ORDER BY created_at DESC';
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function getPostsByIds(postIds) {
  if (!postIds.length) return [];
  const { rows } = await pool.query(
    `SELECT post_id, post_name, post_url, channel_id, created_at FROM dc_forum_posts WHERE post_id = ANY($1)`,
    [postIds]
  );
  return rows;
}

async function deleteForumPost(postId) {
  await pool.query('DELETE FROM dc_forum_posts WHERE post_id = $1', [postId]);
}

// ดึง posts ล่าสุด (สำหรับ dashboard) — ไม่รวม dashboard thread เอง
async function getLatestPosts(guildId, channelId, limit = 5) {
  const config = await getForumConfig(guildId, channelId);
  const excludeId = config?.dashboard_msg_id ?? null;
  const params = [guildId, channelId];
  let sql = `SELECT post_id, post_name, post_url, created_at
             FROM dc_forum_posts
             WHERE guild_id = $1 AND channel_id = $2`;
  if (excludeId) {
    params.push(excludeId);
    sql += ` AND post_id != $${params.length}`;
  }
  params.push(limit);
  sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

// stats สำหรับ dashboard
async function getForumStats(guildId, channelId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)                                                                                AS total,
       SUM(CASE WHEN created_at >= DATE_TRUNC('month', NOW()) THEN 1 ELSE 0 END)               AS this_month,
       SUM(CASE WHEN created_at::date = CURRENT_DATE          THEN 1 ELSE 0 END)               AS today
     FROM dc_forum_posts
     WHERE guild_id = $1 AND channel_id = $2`,
    [guildId, channelId]
  );
  const row = rows[0];
  return {
    total:      Number(row.total),
    this_month: Number(row.this_month),
    today:      Number(row.today),
  };
}

module.exports = {
  getForumConfig,
  getAllForumConfigs,
  upsertForumConfig,
  setDashboardMsgId,
  upsertForumPost,
  deleteForumPost,
  searchPostsByName,
  getPostsByIds,
  getLatestPosts,
  getForumStats,
};
