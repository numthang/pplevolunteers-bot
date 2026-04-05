const { MeiliSearch } = require('meilisearch');

const INDEX_NAME = 'forum_posts';

let client = null;
let ready   = false;

function getClient() {
  if (!client) {
    client = new MeiliSearch({
      host:   process.env.MEILISEARCH_HOST ?? 'http://localhost:7700',
      apiKey: process.env.MEILISEARCH_KEY  ?? '',
    });
  }
  return client;
}

// เช็คว่า Meilisearch พร้อมใช้งานหรือเปล่า (เรียกตอน bot start)
async function initMeilisearch() {
  try {
    const c     = getClient();
    const index = c.index(INDEX_NAME);
    await c.health();

    // ตั้งค่า searchable + filterable fields
    await index.updateSettings({
      searchableAttributes: ['post_name', 'content'],
      filterableAttributes: ['guild_id', 'channel_id'],
      sortableAttributes:   ['created_at'],
    });

    ready = true;
    console.log('[meilisearch] ready');
  } catch (e) {
    ready = false;
    console.warn('[meilisearch] not available, will fallback to MySQL only:', e.message);
  }
}

function isReady() {
  return ready;
}

// upsert document (post_id เป็น primary key)
// content = string รวมทุก message ใน thread
async function upsertPost({ postId, postName, content, postUrl, channelId, guildId, createdAt }) {
  if (!ready) return;
  try {
    const index = getClient().index(INDEX_NAME);
    await index.addDocuments([{
      id:         postId,
      post_name:  postName,
      content:    content ?? '',
      post_url:   postUrl,
      channel_id: channelId,
      guild_id:   guildId,
      created_at: createdAt,
    }], { primaryKey: 'id' });
  } catch (e) {
    console.warn('[meilisearch] upsertPost error:', e.message);
  }
}

// append เนื้อหา message เข้า content เดิม (upsert แบบ merge)
async function appendContent(postId, newText) {
  if (!ready) return;
  try {
    const index = getClient().index(INDEX_NAME);
    const existing = await index.getDocument(postId).catch(() => null);
    const content  = existing ? `${existing.content}\n${newText}` : newText;
    await index.updateDocuments([{ id: postId, content }]);
  } catch (e) {
    console.warn('[meilisearch] appendContent error:', e.message);
  }
}

// ค้นหา — return array of postId
async function searchPosts(keyword, { guildId, channelId } = {}) {
  if (!ready) return [];
  try {
    const index   = getClient().index(INDEX_NAME);
    const filters = [`guild_id = "${guildId}"`];
    if (channelId) filters.push(`channel_id = "${channelId}"`);

    const result = await index.search(keyword, {
      filter: filters.join(' AND '),
      limit:  100,
      attributesToRetrieve: ['id'],
    });
    return result.hits.map(h => h.id);
  } catch (e) {
    console.warn('[meilisearch] searchPosts error:', e.message);
    return [];
  }
}

module.exports = { initMeilisearch, isReady, upsertPost, appendContent, searchPosts };
