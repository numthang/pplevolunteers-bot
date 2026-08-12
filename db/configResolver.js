// db/configResolver.js — รวม config 3 ระดับเป็นค่าเดียวตาม priority
//   personal (user_config) > guild (dc_guild_config) > global (dc_guild_config guild_id='global')
// ใช้ร่วมกันได้ทุก feature ที่อยากได้ default per-user / per-guild / ทั้งระบบ
const { getUserSetting } = require('./userConfig');
const { getSetting }     = require('./settings');
const { orgIdOfGuild }   = require('./org');
const pool               = require('./index');

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

// เหมือน resolveConfig แต่ให้ "ค่าขององค์กร" ชนะ personal ก่อน — ใช้กับ key ที่ควรเป็น
// อัตลักษณ์ขององค์กรเสมอเมื่อสั่งงานในดิสฯ (เช่น quote_ci_accent, เคาะ 2026-08-12:
// คำสั่งในดิสฯ ไม่มีแนวคิด "โพสต์ personal" แบบเว็บ จึงถือว่าทุกคำสั่งเป็นบริบทองค์กรเสมอ)
//
// ⚠️ ค่าองค์กรอยู่ที่ `org_config` ตั้งแต่ migration 2026-08-10 (หน้า /org/settings/brand เซฟที่นั่น)
//    ต้องอ่าน org ก่อน แล้วค่อย fallback `dc_guild_config` — อ่านแต่ guild คือบั๊กเดิม
//    (org ตั้งสีแล้วไม่มีผล เพราะคนละตาราง · เจอ 2026-08-12) · คู่แฝดฝั่งเว็บ: web/lib/quoteAccent.js
async function resolveConfigOrgFirst(discordId, guildId, key) {
  const orgId = guildId ? await orgIdOfGuild(guildId) : null;
  if (orgId) {
    const { rows } = await pool.query(
      `SELECT value FROM org_config WHERE org_id = $1 AND key = $2`, [orgId, key]
    );
    if (rows[0]?.value != null) return { value: rows[0].value, scope: 'org' };
  }
  if (guildId) {
    const guild = await getSetting(guildId, key);
    if (guild != null) return { value: guild, scope: 'guild' };
  }
  if (discordId) {
    const personal = await getUserSetting(discordId, key);
    if (personal != null) return { value: personal, scope: 'personal' };
  }
  const global = await getSetting(GLOBAL_GUILD_ID, key);
  if (global != null) return { value: global, scope: 'global' };
  return { value: null, scope: null };
}

module.exports = { resolveConfig, resolveConfigOrgFirst, GLOBAL_GUILD_ID };
