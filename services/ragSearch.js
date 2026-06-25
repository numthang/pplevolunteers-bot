const { searchPostsWithContent } = require('./meilisearch');
const { getSetting } = require('../db/settings');

const MAX_CONTENT_PER_POST = 800;
const MAX_POSTS = 3;

async function getExcludedChannels(guildId) {
  const v = await getSetting(guildId, 'rag_excluded_channels');
  return Array.isArray(v) ? v : [];
}

async function buildRagContext(question, guildId) {
  const excludeChannelIds = await getExcludedChannels(guildId);
  const results = await searchPostsWithContent(question, { guildId, excludeChannelIds, limit: MAX_POSTS });

  const filtered = results.filter(r => r.content?.trim());
  if (!filtered.length) return null;

  return filtered
    .map(r => `กระทู้: ${r.post_name}\n${r.content.slice(0, MAX_CONTENT_PER_POST)}`)
    .join('\n\n---\n\n');
}

module.exports = { buildRagContext };
