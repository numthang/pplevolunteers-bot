// web/db/botStatus.js — สรุปสถานะการตั้งค่าของ Discord guild หนึ่งตัว (ใช้ที่หน้า /bot)
//
// จุดประสงค์: ตอบคำถาม "เซิร์ฟเวอร์นี้ตั้งครบหรือยัง" ในหน้าเดียว — เดิมต้องไล่เปิดทีละหน้า
// ทุกอย่างในนี้เป็น **ราย guild** ล้วน (Discord artifact) · ของที่เป็นของ org อยู่ /org/settings
import pool from './index.js'

// คีย์ raw ที่หน้า /bot ตั้งค่าได้ — ต้องตรงกับ GUILD_KEYS ใน app/api/social/guild-configs/route.js
export const BOT_GUILD_KEYS = ['news_channel_id', 'social_alert_channel_id']

export async function getBotGuildStatus(guildId) {
  if (!guildId) return null

  const [guildRes, roleRes, cfgRes, accRes] = await Promise.all([
    pool.query(`SELECT guild_id, name, icon_url, org_id FROM dc_guilds WHERE guild_id = $1`, [guildId]),
    pool.query(
      `SELECT count(*)::int AS total,
              count(permission)::int AS with_permission,
              count(scope_node)::int AS with_scope
         FROM dc_guild_roles WHERE guild_id = $1`,
      [guildId]
    ),
    pool.query(
      `SELECT "key", value FROM dc_guild_config
        WHERE guild_id = $1 AND "key" = ANY($2)`,
      [guildId, [...BOT_GUILD_KEYS, 'enabled_features']]
    ),
    // บัญชีโซเชียลที่ผูก guild นี้ไว้เป็น metadata (ตัวบัญชีเป็นของ org — นับเพื่อโชว์เฉยๆ)
    pool.query(
      `SELECT count(*)::int AS n FROM dc_social_accounts WHERE guild_id = $1`,
      [guildId]
    ),
  ])

  const guild = guildRes.rows[0]
  if (!guild) return null

  const cfg = Object.fromEntries(cfgRes.rows.map(r => [r.key, r.value]))
  const enabled = Array.isArray(cfg.enabled_features) ? cfg.enabled_features : []
  const roles = roleRes.rows[0] || { total: 0, with_permission: 0, with_scope: 0 }

  return {
    guild,
    roles,
    // dc_guild_config.value เป็น json → pg parse ให้เป็น string แล้ว
    channels: Object.fromEntries(BOT_GUILD_KEYS.map(k => [k, cfg[k] || null])),
    aiMention: enabled.includes('ai_mention'),
    socialAccounts: accRes.rows[0]?.n ?? 0,
  }
}
