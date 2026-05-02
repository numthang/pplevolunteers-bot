const { upsertForumPost, searchPostsByName, getPostsByIds } = require('../db/forum');
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
  const [mysqlRows, meiliResults] = await Promise.all([
    searchPostsByName(guildId, keyword, channelId),
    meili.searchPosts(keyword, { guildId, channelId }),
  ]);

  const meiliIds   = meiliResults.map(r => r.id);
  const snippetMap = new Map(meiliResults.map(r => [r.id, r.snippet]));
  const mysqlMap   = new Map(mysqlRows.map(r => [r.post_id, r]));

  // fetch metadata สำหรับ ID ที่ Meilisearch เจอแต่ไม่อยู่ใน MySQL name-search
  const meiliOnlyIds = meiliIds.filter(id => !mysqlMap.has(id));
  const meiliOnlyRows = meiliOnlyIds.length ? await getPostsByIds(meiliOnlyIds) : [];

  const bothSet = new Set(meiliIds.filter(id => mysqlMap.has(id)));

  // รวม post จากทั้งสองแหล่ง (dedupe)
  const allMap = new Map();
  for (const row of mysqlRows) allMap.set(row.post_id, row);
  for (const row of meiliOnlyRows) allMap.set(row.post_id, row);

  const results = [...allMap.values()].filter(p => p.post_name && p.post_url).map(p => ({
    ...p,
    snippet: snippetMap.get(p.post_id) ?? null,
  })).sort((a, b) => {
    const aDouble = bothSet.has(a.post_id);
    const bDouble = bothSet.has(b.post_id);
    if (aDouble !== bDouble) return aDouble ? -1 : 1;
    // เรียง newest
    return new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0);
  });

  return results;
}

module.exports = { indexThread, indexMessage, hybridSearch };
