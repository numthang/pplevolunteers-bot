// db/configResolver.js — รวม config 3 ระดับเป็นค่าเดียวตาม priority
//   personal (dc_user_config) > guild (dc_guild_config) > global (dc_guild_config guild_id='global')
// ใช้ร่วมกันได้ทุก feature ที่อยากได้ default per-user / per-guild / ทั้งระบบ
const { getUserSetting } = require('./userConfig');
const { getSetting }     = require('./settings');

const GLOBAL_GUILD_ID = 'global';

// คืน { value, scope } — scope = 'personal' | 'guild' | 'global' | null
async function resolveConfig(discordId, guildId, key) {
  if (discordId) {
    const personal = await getUserSetting(discordId, key);
    if (personal != null) return { value: personal, scope: 'personal' };
  }
  if (guildId) {
    const guild = await getSetting(guildId, key);
    if (guild != null) return { value: guild, scope: 'guild' };
  }
  const global = await getSetting(GLOBAL_GUILD_ID, key);
  if (global != null) return { value: global, scope: 'global' };
  return { value: null, scope: null };
}

module.exports = { resolveConfig, GLOBAL_GUILD_ID };
