// shared cache สำหรับ anti-spam feature (honeypot + quarantine)
// ทั้ง index.js และ commands/server.js import จากที่นี่

const antiSpamConfigCache = new Map(); // guildId → { honeypotChannelId, quarantineRoleId, modChannelId }

function setAntiSpamConfig(guildId, config) {
  const current = antiSpamConfigCache.get(guildId) ?? {};
  antiSpamConfigCache.set(guildId, { ...current, ...config });
}

function clearAntiSpamConfig(guildId, key) {
  const current = antiSpamConfigCache.get(guildId);
  if (!current) return;
  delete current[key];
  antiSpamConfigCache.set(guildId, current);
}

function getAntiSpamConfig(guildId) {
  return antiSpamConfigCache.get(guildId) ?? {};
}

module.exports = { antiSpamConfigCache, setAntiSpamConfig, clearAntiSpamConfig, getAntiSpamConfig };
