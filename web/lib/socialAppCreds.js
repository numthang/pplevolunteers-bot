// web/lib/socialAppCreds.js — app credentials ของโซเชียล (Meta / X) แบบ org-first
//
// creds ย้ายขึ้น org_config (ราย org) แล้ว 2026-07-29 — เดิมผูกราย Discord guild
// ทำให้ org ที่ไม่มี Discord "ถือครองบัญชีโซเชียลได้ แต่กด Connect บัญชีใหม่ไม่ได้"
//
// ลำดับอ่าน: org_config ก่อน → เติมเฉพาะคีย์ที่ขาดจาก dc_guild_config
//   (fallback ช่วงเปลี่ยนผ่าน · แถวเดิมใน dc_guild_config ยังอยู่ จะลบเมื่อทุก org ย้ายครบ)
// ⚠️ ชนิดคอลัมน์ต่างกัน: org_config.value = text (ค่าดิบ) · dc_guild_config.value = json
//    (pg parse json ให้เป็น string แล้ว ทั้งสองทางจึงได้ string เหมือนกัน)
// ⚠️ ที่เดียวที่อ่าน creds ฝั่งเว็บ — route OAuth ทั้ง 4 เส้นต้องเรียกผ่านนี่ ห้ามก๊อป query ไปไว้ในตัวเอง
// คู่แฝดฝั่งบอท: services/metaApi.js getGuildMetaApp() · services/xApi.js getGuildXApp()
import pool from '@/db/index.js'
import { orgIdOfGuild } from '@/db/guilds.js'

// คีย์ที่เป็น app creds (org-scoped) — ต่างจาก news_channel_id ที่เป็น Discord artifact ราย guild
export const SOCIAL_APP_KEYS = [
  'meta_app_id', 'meta_app_secret',
  'threads_app_id', 'threads_app_secret',
  'x_consumer_key', 'x_consumer_secret',
]

const META_KEYS    = ['meta_app_id', 'meta_app_secret']
const THREADS_KEYS = ['threads_app_id', 'threads_app_secret']
const X_KEYS       = ['x_consumer_key', 'x_consumer_secret']

// คืน map เฉพาะคีย์ที่ตั้งค่าแล้ว (org ชนะราย key) · ไม่ตั้งเลย = {}
export async function getSocialAppCreds({ orgId = null, guildId = null, keys = SOCIAL_APP_KEYS } = {}) {
  const oid = orgId ?? await orgIdOfGuild(guildId)
  const out = {}

  if (oid) {
    const { rows } = await pool.query(
      `SELECT key, value FROM org_config WHERE org_id = $1 AND key = ANY($2)`,
      [oid, keys]
    )
    for (const r of rows) if (r.value) out[r.key] = r.value
  }

  if (guildId && keys.some(k => !out[k])) {
    const { rows } = await pool.query(
      `SELECT "key", value FROM dc_guild_config WHERE guild_id = $1 AND "key" = ANY($2)`,
      [guildId, keys]
    )
    for (const r of rows) if (r.value && !out[r.key]) out[r.key] = r.value
  }

  return out
}

// { app_id, app_secret } — null ถ้ายังตั้งไม่ครบคู่ (OAuth ใช้ทั้งคู่เสมอ)
export async function getMetaApp({ orgId = null, guildId = null } = {}) {
  const m = await getSocialAppCreds({ orgId, guildId, keys: META_KEYS })
  if (!m.meta_app_id || !m.meta_app_secret) return null
  return { app_id: m.meta_app_id, app_secret: m.meta_app_secret }
}

/**
 * { app_id, app_secret } ของ Threads — **คนละชุดกับ Facebook เสมอ** (ยืนยันกับ user 2026-08-08)
 *
 * Meta ออก Threads App ID/Secret แยกให้เมื่อเพิ่ม use case "Threads API" ในแอพเดียวกัน
 * ⛔ ห้าม fallback ไปใช้ meta_app_id/secret — จะได้ error เรื่อง client_secret ที่อ่านไม่ออกว่าเกิดจากอะไร
 *    ปล่อยให้ null แล้วบอกให้ไปกรอกช่อง Threads ตรงๆ ดีกว่า
 */
export async function getThreadsApp({ orgId = null, guildId = null } = {}) {
  const m = await getSocialAppCreds({ orgId, guildId, keys: THREADS_KEYS })
  if (!m.threads_app_id || !m.threads_app_secret) return null
  return { app_id: m.threads_app_id, app_secret: m.threads_app_secret }
}

// { api_key, api_secret } — null ถ้ายังตั้งไม่ครบคู่
export async function getXApp({ orgId = null, guildId = null } = {}) {
  const m = await getSocialAppCreds({ orgId, guildId, keys: X_KEYS })
  if (!m.x_consumer_key || !m.x_consumer_secret) return null
  return { api_key: m.x_consumer_key, api_secret: m.x_consumer_secret }
}
