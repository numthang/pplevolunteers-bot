// shared cache สำหรับ forum feature
// ทั้ง index.js และ commands/panel.js import จากที่นี่

const forumChannelCache    = new Map(); // guildId → Set<channelId>
const dashboardThreadCache = new Map(); // guildId → Set<threadId>

function addForumChannel(guildId, channelId) {
  const set = forumChannelCache.get(guildId) ?? new Set();
  set.add(channelId);
  forumChannelCache.set(guildId, set);
}

function addDashboardThread(guildId, threadId) {
  const set = dashboardThreadCache.get(guildId) ?? new Set();
  set.add(threadId);
  dashboardThreadCache.set(guildId, set);
}

module.exports = { forumChannelCache, dashboardThreadCache, addForumChannel, addDashboardThread };
