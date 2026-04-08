const pool = require('./index');

// ─── dc_forum_config ────────────────────────────────────────────────────────

async function getForumConfig(guildId, channelId) {
  const [rows] = await pool.execute(
    'SELECT * FROM dc_forum_config WHERE guild_id = ? AND channel_id = ?',
    [guildId, channelId]
  );
  return rows[0] ?? null;
}

async function getAllForumConfigs(guildId) {
  const [rows] = await pool.execute(
    'SELECT * FROM dc_forum_config WHERE guild_id = ?',
    [guildId]
  );
  return rows;
}

async function upsertForumConfig(guildId, channelId, { dashboardMsgId, itemsPerPage } = {}) {
  await pool.execute(
    `INSERT INTO dc_forum_config (guild_id, channel_id, dashboard_msg_id, items_per_page)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       dashboard_msg_id = COALESCE(VALUES(dashboard_msg_id), dashboard_msg_id),
       items_per_page   = COALESCE(VALUES(items_per_page), items_per_page)`,
    [guildId, channelId, dashboardMsgId ?? null, itemsPerPage ?? 10]
  );
}

async function setDashboardMsgId(guildId, channelId, msgId) {
  await pool.execute(
    'UPDATE dc_forum_config SET dashboard_msg_id = ? WHERE guild_id = ? AND channel_id = ?',
    [msgId, guildId, channelId]
  );
}

// ─── dc_forum_posts ─────────────────────────────────────────────────────────

async function upsertForumPost(guildId, channelId, { postId, postName, postUrl, authorId, createdAt }) {
  await pool.execute(
    `INSERT INTO dc_forum_posts (guild_id, channel_id, post_id, post_name, post_url, author_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       post_name  = VALUES(post_name),
       post_url   = VALUES(post_url),
       indexed_at = CURRENT_TIMESTAMP`,
    [guildId, channelId, postId, postName, postUrl, authorId ?? null, createdAt]
  );
}

// ค้น post_name ด้วย LIKE
async function searchPostsByName(guildId, keyword, channelId = null) {
  const params = [`%${keyword}%`, guildId];
  let sql = `SELECT post_id, post_name, post_url, channel_id, created_at
             FROM dc_forum_posts
             WHERE post_name LIKE ? AND guild_id = ?`;
  if (channelId) {
    sql += ' AND channel_id = ?';
    params.push(channelId);
  }
  sql += ' ORDER BY created_at DESC';
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function deleteForumPost(postId) {
  await pool.execute('DELETE FROM dc_forum_posts WHERE post_id = ?', [postId]);
}

// ดึง posts ล่าสุด (สำหรับ dashboard) — ไม่รวม dashboard thread เอง
async function getLatestPosts(guildId, channelId, limit = 5) {
  const config = await getForumConfig(guildId, channelId);
  const excludeId = config?.dashboard_msg_id ?? null;
  const params = [guildId, channelId];
  let sql = `SELECT post_id, post_name, post_url, created_at
             FROM dc_forum_posts
             WHERE guild_id = ? AND channel_id = ?`;
  if (excludeId) {
    sql += ' AND post_id != ?';
    params.push(excludeId);
  }
  sql += ` ORDER BY created_at DESC LIMIT ${limit}`;
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// stats สำหรับ dashboard
async function getForumStats(guildId, channelId) {
  const [[row]] = await pool.execute(
    `SELECT
       COUNT(*)                                                      AS total,
       SUM(created_at >= DATE_FORMAT(NOW(), '%Y-%m-01'))             AS this_month,
       SUM(DATE(created_at) = CURDATE())                            AS today
     FROM dc_forum_posts
     WHERE guild_id = ? AND channel_id = ?`,
    [guildId, channelId]
  );
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
  getLatestPosts,
  getForumStats,
};
