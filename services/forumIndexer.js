const { upsertForumPost, searchPostsByName } = require('../db/forum');
const meili = require('./meilisearch');

// index thread ใหม่ (threadCreate event)
async function indexThread(thread, guildId, channelId) {
  const postUrl = `https://discord.com/channels/${guildId}/${thread.id}`;
  await upsertForumPost(guildId, channelId, {
    postId:    thread.id,
    postName:  thread.name,
    postUrl,
    authorId:  thread.ownerId ?? null,
    createdAt: new Date(thread.createdTimestamp),
  });

  // ดึง OP message แล้ว index เข้า Meilisearch
  const starter = await thread.fetchStarterMessage().catch(() => null);
  await meili.upsertPost({
    postId:    thread.id,
    postName:  thread.name,
    content:   starter?.content ?? '',
    postUrl,
    channelId,
    guildId,
    createdAt: thread.createdTimestamp,
  });
}

// append message เข้า thread ที่มีอยู่แล้ว (messageCreate event)
async function indexMessage(message, postId) {
  if (!message.content?.trim()) return;
  await meili.appendContent(postId, message.content);
}

// Hybrid search — merge MySQL + Meilisearch, dedupe by post_id
// โพสต์ที่ match ทั้งสองแหล่งขึ้นก่อน, ที่เหลือเรียง newest
async function hybridSearch(keyword, { guildId, channelId } = {}) {
  const [mysqlRows, meiliIds] = await Promise.all([
    searchPostsByName(guildId, keyword, channelId),
    meili.searchPosts(keyword, { guildId, channelId }),
  ]);

  const meiliSet   = new Set(meiliIds);
  const mysqlMap   = new Map(mysqlRows.map(r => [r.post_id, r]));
  const bothSet    = new Set([...meiliIds].filter(id => mysqlMap.has(id)));

  // รวม post จากทั้งสองแหล่ง (dedupe)
  const allMap = new Map();
  for (const row of mysqlRows) allMap.set(row.post_id, row);
  for (const id of meiliIds) {
    if (!allMap.has(id)) {
      // Meilisearch มีแต่ MySQL ไม่มี — ใส่ placeholder (ไม่มี created_at)
      allMap.set(id, { post_id: id, post_name: null, post_url: null, channel_id: channelId, created_at: null });
    }
  }

  const results = [...allMap.values()].filter(p => p.post_name && p.post_url).sort((a, b) => {
    const aDouble = bothSet.has(a.post_id);
    const bDouble = bothSet.has(b.post_id);
    if (aDouble !== bDouble) return aDouble ? -1 : 1;
    // เรียง newest
    return new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0);
  });

  return results;
}

module.exports = { indexThread, indexMessage, hybridSearch };
